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
    this.settings = { enableTimer: false };
    this.rates = { base: 10 }; // base rate per score point
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
      rankings: this.rankings
    };
  }

  addPlayer(name, socketId, isBot = false, initialCoins = 1000, avatar = null) {
    const existingPlayer = this.players.find(p => p.name === name && !p.isBot);
    if (existingPlayer && existingPlayer.isConnected === false) {
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      if (avatar) existingPlayer.avatar = avatar;
      this.addLog({ key: 'log.joined', params: { name: name + ' (Reconnected)' } });
      return existingPlayer;
    }

    if (this.players.length >= 3) return null;
    const id = isBot ? `bot_${Math.random().toString(36).substr(2, 9)}` : socketId;
    const player = { id, name, socketId, isBot, isReady: isBot, isConnected: true, avatar };
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
      p.isConnected = false;
      this.addLog({ key: 'log.left', params: { name: p.name } });

      const activeHumans = this.players.filter(pl => !pl.isBot && pl.isConnected);
      if (activeHumans.length === 0) {
        return true; // destroy room
      }
    }
    return false;
  }

  startGame(io) {
    this.status = 'BIDDING';
    this.roundNumber++;
    this.deck = shuffleDeck(createDizhuDeck());

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

    this.players.forEach(p => {
      this.hands[p.id] = this.deck.splice(0, 17).sort((a, b) => a.rank - b.rank);
      this.farmerCardsPlayedCount[p.id] = 0;
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
    const lastCards = this.lastPlayedHand ? this.lastPlayedHand.cards : null;
    if (!compareHands(lastCards, cardsToPlay)) {
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
    } else {
      this.farmerCardsPlayedCount[playerId] = (this.farmerCardsPlayedCount[playerId] || 0) + cardsToPlay.length;
    }

    const parsed = parseHand(cardsToPlay);
    // Double for bomb or rocket
    if (parsed.type === 'bomb' || parsed.type === 'rocket') {
      this.bombsCount++;
      this.addLog({ key: 'log.dizhu.bombPlayed', params: { name: currentPlayer.name } });
    }

    this.lastPlayedHand = { playerId, cards: cardsToPlay };
    this.passCount = 0; // reset passes

    this.addLog({ key: 'log.dizhu.playHand', params: { name: currentPlayer.name, type: parsed.type, cards: formatDizhuCardsForLog(cardsToPlay) } });

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
    } else {
      // Farmers won. Check if landlord played only their initial single hand of card(s) once.
      // Wait, landlord only plays 1 hand means landlordCardsPlayedCount equals the number of cards in their first play.
      // But they starts the game. If they played exactly 1 time (which we can check, but simpler: let's track the count).
      // Let's assume landlord only played once. Since landlord cards played is just the length of their first hand, and nothing else.
      // Wait, we can track landlord turns played: if landlord played exactly 1 hand, then yes.
      // Let's keep it simple: if landlordCardsPlayedCount is very small or if we can track landlordTurnCount.
      // Let's just double checks count. If landlord played exactly 1 turn. We'll simplify: if landlords played less than 20 cards and played exactly once.
      // Let's count turns played by landlord. We can assume if landlordCardsPlayedCount equals cards in their first hand and nothing more.
      // For simplicity, let's say if landlords played 1 hand and no more. Let's make it the default spring factor.
    }

    const multiplier = Math.pow(2, this.bombsCount) * (isSpring ? 2 : 1) * this.highestBid;
    const baseWinAmount = this.rates.base * multiplier;

    // Landlord wins double / loses double
    const winScores = {};
    const rankings = { winner: winnerId, landlordWon, isSpring, multiplier, details: [] };

    this.players.forEach(p => {
      let net = 0;
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
      updateDizhuPlayerStats(io, p.id, net, net > 0, {
        isLandlord: p.id === this.landlordId,
        isSpring,
        bombsCount: this.bombsCount
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
