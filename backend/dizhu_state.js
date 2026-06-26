// backend/dizhu_state.js
// Game State class for Dou Dizhu (斗地主)

const { createDizhuDeck, shuffleDeck, parseHand, compareHands } = require('./dizhu_engine');
const { executeDizhuBotTurn } = require('./dizhu_bot');
const { updatePlayerStats: dbUpdatePlayerStats } = require('./firebase-admin');

const DIZHU_SUIT_EMOJI = { hearts: '♥', spades: '♠', clubs: '♣', diamonds: '♦', joker: '☺' };

async function updateDizhuPlayerStats(io, playerId, netCoins, isWin, extraStats = {}) {
  if (!playerId || playerId.startsWith('bot-') || playerId.startsWith('bot_')) return;
  try {
    const sockets = await io.fetchSockets();
    const playerSocket = sockets.find(s => s.id === playerId);
    if (!playerSocket || !playerSocket.user) return; // Guest or unauthenticated

    await dbUpdatePlayerStats(playerSocket.user.uid, 'dizhu', netCoins, isWin, extraStats);
  } catch (err) {
    console.error('Failed to update stats for dizhu player', playerId, err);
  }
}

function formatDizhuCardsForLog(cards) {
  if (!cards || !Array.isArray(cards)) return '';
  return cards.map(c => {
    if (c.suit === 'joker') return c.display;
    return `${DIZHU_SUIT_EMOJI[c.suit] || ''}${c.value}`;
  }).join(' ');
}

class DizhuGameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.gameType = 'dizhu';
    this.players = []; // { id, name, socketId, isBot: false, isReady: false }
    this.deck = [];
    this.currentTurn = 0;
    this.roundNumber = 0;
    this.status = 'WAITING'; // WAITING, BIDDING, PLAYING, GAME_OVER

    this.hands = {}; // playerId -> array of cards
    this.bottomCards = []; // 3 cards
    this.landlordId = null;
    
    // Bidding info
    this.highestBid = 0;
    this.highestBidder = null;
    this.bids = {}; // playerId -> bid value
    this.bidCount = 0;

    // Playing info
    this.lastPlayedHand = null; // { playerId, cards: [...] }
    this.passCount = 0;
    this.bombsCount = 0; // doubles the score each time a bomb/rocket is played
    
    // Analytics/Spring
    this.landlordCardsPlayedCount = 0;
    this.farmerCardsPlayedCount = {}; // playerId -> count of cards played
    
    this.logs = [];
    this.accumulatedPoints = {}; // playerId -> net points (coins)
    this.settings = { enableTimer: false, mode: 'classic' };
    this.rates = { base: 10 }; // base rate per score point
    this.wildcardRank = null;
  }

  addLog(msg) {
    this.logs.push(msg);
    if (this.logs.length > 50) this.logs.shift();
  }

  broadcastState(io) {
    this.players.forEach(p => {
      if (p.isBot) return;
      io.to(p.socketId).emit('gameState', this.getSanitizedState(p.id));
    });
  }

  getSanitizedState(playerId) {
    const sanitizedHands = {};
    Object.keys(this.hands).forEach(pid => {
      if (pid === playerId || this.status === 'GAME_OVER') {
        sanitizedHands[pid] = this.hands[pid];
      } else {
        sanitizedHands[pid] = this.hands[pid].map(() => ({ type: 'back' }));
      }
    });

    // Reveal bottom cards only during playing or game over
    const showBottom = this.status === 'PLAYING' || this.status === 'GAME_OVER';

    return {
      roomId: this.roomId,
      gameType: this.gameType,
      players: this.players,
      status: this.status,
      roundNumber: this.roundNumber,
      currentTurn: this.currentTurn,
      hands: sanitizedHands,
      bottomCards: showBottom ? this.bottomCards : [{ type: 'back' }, { type: 'back' }, { type: 'back' }],
      landlordId: this.landlordId,
      highestBid: this.highestBid,
      lastPlayedHand: this.lastPlayedHand,
      bombsCount: this.bombsCount,
      logs: this.logs,
      accumulatedPoints: this.accumulatedPoints,
      settings: this.settings,
      rates: this.rates,
      rankings: this.rankings,
      wildcardRank: this.wildcardRank
    };
  }

  addPlayer(name, socketId, isBot = false, difficulty = 'normal', initialCoins = 1000, avatar = null) {
    if (!isBot) {
      avatar = initialCoins;
      initialCoins = typeof difficulty === 'number' ? difficulty : 1000;
      difficulty = 'normal';
    }

    const existingPlayer = this.players.find(p => p.name === name && !p.isBot);
    if (existingPlayer && existingPlayer.isConnected === false) {
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      if (avatar) existingPlayer.avatar = avatar;
      this.addLog({ key: 'log.joined', params: { name: name + ' (Reconnected)' } });
      return existingPlayer;
    }

    if (!isBot && this.players.length >= 3) {
      const botIdx = this.players.findIndex(p => p.isBot);
      if (botIdx !== -1) {
        const botId = this.players[botIdx].id;
        this.players.splice(botIdx, 1);
        delete this.hands[botId];
        delete this.accumulatedPoints[botId];
      }
    }

    if (this.players.length >= 3) return null;
    const id = isBot ? `bot_${Math.random().toString(36).substr(2, 9)}` : socketId;
    const player = { id, name, socketId, isBot, difficulty: isBot ? difficulty : null, isReady: isBot, isConnected: true, avatar };
    this.players.push(player);

    this.hands[id] = [];
    this.accumulatedPoints[id] = initialCoins;

    this.addLog({ key: 'log.joined', params: { name } });
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx !== -1) {
      const p = this.players[idx];
      if (this.status === 'WAITING' || this.status === 'GAME_OVER') {
        this.players.splice(idx, 1);
        delete this.hands[p.id];
        delete this.accumulatedPoints[p.id];
      } else {
        p.isConnected = false;
      }
      this.addLog({ key: 'log.left', params: { name: p.name } });

      const activeHumans = this.players.filter(pl => !pl.isBot && pl.isConnected);
      if (activeHumans.length === 0) {
        return true; // destroy room
      }
    }
    return false;
  }

  changeGameMode(mode, io) {
    if (this.status !== 'WAITING') return false;
    if (mode === 'classic' || mode === 'laizi') {
      this.settings.mode = mode;
      this.broadcastState(io);
      return true;
    }
    return false;
  }

  startGame(io) {
    this.status = 'BIDDING';
    this.roundNumber++;
    this.deck = shuffleDeck(createDizhuDeck());
    this.wildcardRank = null;

    // Reset game parameters
    this.landlordId = null;
    this.highestBid = 0;
    this.highestBidder = null;
    this.bids = {};
    this.bidCount = 0;
    this.lastPlayedHand = null;
    this.passCount = 0;
    this.bombsCount = 0;
    this.landlordCardsPlayedCount = 0;
    this.farmerCardsPlayedCount = {};
    this.landlordPlayCount = 0;
    this.playerBombsPlayedCount = {};
    this.playerRocketsPlayedCount = {};
    this.playerAirplanesPlayedCount = {};
    this.playerTripleOnesPlayedCount = {};
    this.playerTriplePairsPlayedCount = {};
    this.playerQuadsPlayedCount = {};
    this.hasBidded = {};

    this.players.forEach(p => {
      this.hands[p.id] = this.deck.splice(0, 17).sort((a, b) => a.rank - b.rank);
      this.farmerCardsPlayedCount[p.id] = 0;
      this.playerBombsPlayedCount[p.id] = 0;
      this.playerRocketsPlayedCount[p.id] = 0;
      this.playerAirplanesPlayedCount[p.id] = 0;
      this.playerTripleOnesPlayedCount[p.id] = 0;
      this.playerTriplePairsPlayedCount[p.id] = 0;
      this.playerQuadsPlayedCount[p.id] = 0;
      this.hasBidded[p.id] = false;
    });

    // 3 cards left for the bottom deck
    this.bottomCards = this.deck.splice(0, 3).sort((a, b) => a.rank - b.rank);

    // Random starting bidder
    this.currentTurn = Math.floor(Math.random() * this.players.length);

    this.addLog({ key: 'log.dizhu.deal', params: { round: this.roundNumber } });
    this.broadcastState(io);

    // Trigger bot if it's a bot's turn
    this.triggerTurn(io);
  }

  triggerTurn(io) {
    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.isBot) {
      setTimeout(() => {
        executeDizhuBotTurn(this, io);
      }, 1500);
    }
  }

  bid(playerId, bidValue, io) {
    if (this.status !== 'BIDDING') return false;
    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.id !== playerId) return false;

    // Validate bid
    if (bidValue < 0 || bidValue > 3) return false;
    if (bidValue !== 0 && bidValue <= this.highestBid) return false;

    if (bidValue > 0) {
      this.hasBidded[playerId] = true;
    }

    this.bids[playerId] = bidValue;
    this.bidCount++;

    if (bidValue > this.highestBid) {
      this.highestBid = bidValue;
      this.highestBidder = playerId;
    }

    const valueStr = bidValue === 0 ? 'Pass' : `${bidValue} Points`;
    this.addLog({ key: 'log.dizhu.bid', params: { name: currentPlayer.name, bid: valueStr } });

    // Instantly end bidding if someone bids 3
    if (bidValue === 3) {
      this.endBidding(this.highestBidder, io);
      return true;
    }

    // Check if bidding phase has ended (everyone got a chance)
    if (this.bidCount >= 3) {
      if (this.highestBid === 0) {
        // Redeal
        this.addLog({ key: 'log.dizhu.redeal', params: {} });
        this.startGame(io);
        return true;
      } else {
        this.endBidding(this.highestBidder, io);
        return true;
      }
    }

    // Move to next player to bid
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.broadcastState(io);
    this.triggerTurn(io);
    return true;
  }

  endBidding(landlordId, io) {
    this.landlordId = landlordId;
    this.status = 'PLAYING';
    
    // Add bottom cards to landlord's hand
    this.hands[landlordId] = [...this.hands[landlordId], ...this.bottomCards].sort((a, b) => a.rank - b.rank);
    
    const landlordName = this.players.find(p => p.id === landlordId).name;
    this.addLog({ key: 'log.dizhu.landlordRevealed', params: { name: landlordName, cards: formatDizhuCardsForLog(this.bottomCards) } });

    if (this.settings.mode === 'laizi') {
      // Pick a random rank from 3 to 15 (inclusive, which excludes jokers: 16 and 17)
      this.wildcardRank = Math.floor(Math.random() * 13) + 3;
      const rankToDisplay = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' }[this.wildcardRank] || String(this.wildcardRank);
      this.addLog({ key: 'log.dizhu.wildcardRolled', params: { rank: rankToDisplay } });
    }

    // Landlord goes first
    this.currentTurn = this.players.findIndex(p => p.id === landlordId);
    this.broadcastState(io);
    this.triggerTurn(io);
  }

  playCards(playerId, cards, io) {
    if (this.status !== 'PLAYING') return false;
    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.id !== playerId) return false;

    // Check if player actually has these cards in their hand
    const playerHand = this.hands[playerId];
    const cardsToPlay = [];
    for (const c of cards) {
      const idx = playerHand.findIndex(h => h.id === c.id);
      if (idx === -1) return false; // Card not in hand
      cardsToPlay.push(playerHand[idx]);
    }

    // Check if play beats last played hand
    if (!compareHands(this.lastPlayedHand, cardsToPlay, this.wildcardRank)) {
      return false; // Invalid or too small combination
    }

    // Valid play! Remove cards from hand
    for (const c of cardsToPlay) {
      const idx = playerHand.findIndex(h => h.id === c.id);
      playerHand.splice(idx, 1);
    }

    // Count towards springs
    if (playerId === this.landlordId) {
      this.landlordCardsPlayedCount += cardsToPlay.length;
      this.landlordPlayCount++;
    } else {
      this.farmerCardsPlayedCount[playerId] = (this.farmerCardsPlayedCount[playerId] || 0) + cardsToPlay.length;
    }

    const parsed = parseHand(cardsToPlay, this.wildcardRank);
    
    // Broadcast action animation for combos (excluding singles/pairs)
    const animTypes = ['triple', 'triple_one', 'triple_pair', 'straight', 'double_straight', 'triple_straight', 'plane_wings', 'quad_two', 'bomb', 'rocket'];
    if (parsed && animTypes.includes(parsed.type)) {
      let animType = parsed.type;
      if (animType === 'triple') {
        animType = 'triple';
      } else if (animType.startsWith('plane') || animType === 'triple_straight') {
        animType = 'plane';
      }
      io.to(this.roomId).emit('actionAnim', {
        type: animType,
        playerId: playerId
      });
    }

    // Double for bomb or rocket
    if (parsed.type === 'bomb') {
      this.bombsCount++;
      this.playerBombsPlayedCount[playerId] = (this.playerBombsPlayedCount[playerId] || 0) + 1;
      this.addLog({ key: 'log.dizhu.bombPlayed', params: { name: currentPlayer.name } });
    } else if (parsed.type === 'rocket') {
      this.bombsCount++;
      this.playerRocketsPlayedCount[playerId] = (this.playerRocketsPlayedCount[playerId] || 0) + 1;
      this.addLog({ key: 'log.dizhu.bombPlayed', params: { name: currentPlayer.name } });
    } else if (parsed.type === 'plane_wings' || parsed.type === 'triple_straight') {
      this.playerAirplanesPlayedCount[playerId] = (this.playerAirplanesPlayedCount[playerId] || 0) + 1;
    } else if (parsed.type === 'triple_one') {
      this.playerTripleOnesPlayedCount[playerId] = (this.playerTripleOnesPlayedCount[playerId] || 0) + 1;
    } else if (parsed.type === 'triple_pair') {
      this.playerTriplePairsPlayedCount[playerId] = (this.playerTriplePairsPlayedCount[playerId] || 0) + 1;
    } else if (parsed.type === 'quad_two') {
      this.playerQuadsPlayedCount[playerId] = (this.playerQuadsPlayedCount[playerId] || 0) + 1;
    }

    this.lastPlayedHand = { 
      playerId, 
      cards: parsed.cards,
      type: parsed.type,
      rank: parsed.rank,
      wingType: parsed.wingType,
      bombType: parsed.bombType
    };
    this.passCount = 0; // reset passes

    this.addLog({ key: 'log.dizhu.playHand', params: { name: currentPlayer.name, type: parsed.type, cards: formatDizhuCardsForLog(parsed.cards) } });

    // Check Game Over
    if (playerHand.length === 0) {
      this.handleGameEnd(playerId, io);
      return true;
    }

    // Next turn
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.broadcastState(io);
    this.triggerTurn(io);
    return true;
  }

  pass(playerId, io) {
    if (this.status !== 'PLAYING') return false;
    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.id !== playerId) return false;
    if (!this.lastPlayedHand) return false; // Cannot pass on a free play

    this.passCount++;
    this.addLog({ key: 'log.dizhu.pass', params: { name: currentPlayer.name } });

    // If 2 consecutive players passed, the board resets and the turn holder gets a free play
    if (this.passCount >= 2) {
      this.lastPlayedHand = null;
      this.passCount = 0;
    }

    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.broadcastState(io);
    this.triggerTurn(io);
    return true;
  }

  handleGameEnd(winnerId, io) {
    this.status = 'GAME_OVER';

    const landlordWon = winnerId === this.landlordId;

    // Spring calculation
    let isSpring = false;
    if (landlordWon) {
      // Landlord won. Check if any farmer played any card.
      const totalFarmerPlays = Object.values(this.farmerCardsPlayedCount).reduce((a, b) => a + b, 0);
      if (totalFarmerPlays === 0) isSpring = true;
    }
    // Anti-spring calculation
    let isAntiSpring = false;
    if (!landlordWon && this.landlordPlayCount === 1) {
      isAntiSpring = true;
    }

    const multiplier = Math.pow(2, this.bombsCount) * ((isSpring || isAntiSpring) ? 2 : 1) * this.highestBid;
    const baseWinAmount = this.rates.base * multiplier;

    // Landlord wins double / loses double
    const winScores = {};
    const rankings = { winner: winnerId, landlordWon, isSpring, isAntiSpring, multiplier, details: [] };

    this.players.forEach(p => {
      let net = 0;
      const isWinner = p.id === winnerId;
      if (landlordWon) {
        if (p.id === this.landlordId) {
          net = baseWinAmount * 2;
        } else {
          net = -baseWinAmount;
        }
      } else {
        if (p.id === this.landlordId) {
          net = -baseWinAmount * 2;
        } else {
          net = baseWinAmount;
        }
      }
      this.accumulatedPoints[p.id] += net;
      winScores[p.id] = net;
      rankings.details.push({
        id: p.id,
        name: p.name,
        coinsChange: net,
        finalCoins: this.accumulatedPoints[p.id],
        isLandlord: p.id === this.landlordId,
        cardsLeft: this.hands[p.id].length
      });
      
      // Update stats in firebase
      const isPlayerLandlord = p.id === this.landlordId;
      const isWin = isWinner || (!isPlayerLandlord && !landlordWon) || (isPlayerLandlord && landlordWon);
      
      updateDizhuPlayerStats(io, p.id, net, isWin, {
        landlordGames: isPlayerLandlord ? 1 : 0,
        landlordWins: (isPlayerLandlord && isWin) ? 1 : 0,
        farmerGames: !isPlayerLandlord ? 1 : 0,
        farmerWins: (!isPlayerLandlord && isWin) ? 1 : 0,
        landlordChoiceAttempts: this.hasBidded[p.id] ? 1 : 0,
        maxBombsSingleGame: this.playerBombsPlayedCount[p.id] || 0,
        rocketCount: this.playerRocketsPlayedCount[p.id] || 0,
        highestMultiplier: multiplier,
        springCount: (isPlayerLandlord && isSpring) ? 1 : 0,
        antiSpringCount: (!isPlayerLandlord && isAntiSpring) ? 1 : 0,
        lostGamesCount: !isWin ? 1 : 0,
        remainingCardsLostSum: !isWin ? this.hands[p.id].length : 0,
        airplaneCount: this.playerAirplanesPlayedCount[p.id] || 0,
        tripleOneCount: this.playerTripleOnesPlayedCount[p.id] || 0,
        triplePairCount: this.playerTriplePairsPlayedCount[p.id] || 0,
        quadTwoCount: this.playerQuadsPlayedCount[p.id] || 0,
        bombPlayedCount: this.playerBombsPlayedCount[p.id] || 0
      });
    });

    this.rankings = rankings;
    this.addLog({ key: 'log.dizhu.gameOver', params: { winner: this.players.find(p => p.id === winnerId).name } });

    this.broadcastState(io);

    // Emit gameOver details
    io.to(this.roomId).emit('gameOver', {
      gameType: 'dizhu',
      rankings,
      allHands: this.hands
    });
  }
}

module.exports = DizhuGameState;
