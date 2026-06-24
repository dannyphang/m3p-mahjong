const { createLamiDeck, shuffleLamiDeck, isValidStraightFlush, isValidSet, orderStraightFlush, orderSet, calculateHandPoints, calculateAJokerPieces, hasAnyValidMove, isExactValidSequence, getCardValue } = require('./lami_engine');
const { executeBotTurn } = require('./lami_bot');
const { updatePlayerStats: dbUpdatePlayerStats } = require('./firebase-admin');

const LAMI_SUIT_EMOJI = { red: '♥', blue: '♠', green: '♣', yellow: '♦' };

async function updateLamiPlayerStats(io, playerId, netCoins, isWin, extraStats = {}) {
  if (!playerId || playerId.startsWith('bot-')) return;
  try {
    const sockets = await io.fetchSockets();
    const playerSocket = sockets.find(s => s.id === playerId);
    if (!playerSocket || !playerSocket.user) return; // Guest or unauthenticated

    await dbUpdatePlayerStats(playerSocket.user.uid, 'lami', netCoins, isWin, extraStats);
  } catch (err) {
    console.error('Failed to update stats for lami player', playerId, err);
  }
}

function formatLamiTilesForLog(tiles) {
  if (!tiles || !Array.isArray(tiles)) return '';
  return tiles.map(t => {
    if (t.type === 'joker' || t.value === 'joker' || t.value === 'Joker') return '☺ Joker';
    let val = t.value;
    if (val === 1 || val === '1') val = 'A';
    if (val === 11) val = 'J';
    if (val === 12) val = 'Q';
    if (val === 13) val = 'K';
    return `${LAMI_SUIT_EMOJI[t.suit] || ''}${val}`;
  }).join(' ');
}

class LamiGameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.gameType = 'lami';
    this.players = []; // { id, name, socketId, isBot: false, isReady: false, hasBrokenIce: false, burned: false }
    this.deck = [];
    this.currentTurn = 0; // index of players (0 to 3)
    this.roundNumber = 0;
    this.status = 'WAITING'; // WAITING, PLAYING, GAME_OVER
    
    this.hands = {}; // playerId -> array of tiles
    this.publicMelds = []; // array of { id, type: 'straight'|'set', tiles: [] }
    
    this.logs = [];
    this.accumulatedPoints = {}; // playerId -> net points

    this.settings = {};
    this.rates = {
      win: 20,
      joker: 10,
      ace: 5
    };
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

    return {
      roomId: this.roomId,
      gameType: this.gameType,
      players: this.players,
      status: this.status,
      roundNumber: this.roundNumber,
      currentTurn: this.currentTurn,
      dealerIndex: this.dealerIndex,
      hands: sanitizedHands,
      publicMelds: this.publicMelds,
      logs: this.logs,
      accumulatedPoints: this.accumulatedPoints,
      settings: this.settings,
      rates: this.rates,
      rankings: this.rankings
    };
  }

  addPlayer(name, socketId, isBot = false, initialCoins = 1000, avatar = null) {
    // Check if player is reconnecting
    const existingPlayer = this.players.find(p => p.name === name && !p.isBot);
    if (existingPlayer && existingPlayer.isConnected === false) {
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      if (avatar) existingPlayer.avatar = avatar;
      this.addLog({ key: 'log.joined', params: { name: name + ' (Reconnected)' } });
      return existingPlayer;
    }

    if (!isBot && this.players.length >= 4) {
      const botIdx = this.players.findIndex(p => p.isBot);
      if (botIdx !== -1) {
        const botId = this.players[botIdx].id;
        this.players.splice(botIdx, 1);
        delete this.hands[botId];
        delete this.accumulatedPoints[botId];
      }
    }

    if (this.players.length >= 4) return null;
    const id = isBot ? `bot_${Math.random().toString(36).substr(2, 9)}` : socketId;
    const player = { id, name, socketId, isBot, isReady: isBot, hasBrokenIce: false, burned: false, isConnected: true, avatar };
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
        return true; // indicates room should be destroyed
      }
    }
    return false;
  }

  startGame(io) {
    this.status = 'PLAYING';
    this.roundNumber++;
    this.publicMelds = [];
    this.lastMovePlayerId = null;
    this.deck = shuffleLamiDeck(createLamiDeck());
    
    this.players.forEach(p => {
      p.hasBrokenIce = false;
      p.burned = false;
      p.passedOut = false;
      p.consecutivePasses = 0;
      this.hands[p.id] = this.deck.splice(0, 20); // Deal 20 cards
    });

    let startingPlayerIndex = 0;
    if (this.rankings && this.rankings.winner) {
      startingPlayerIndex = this.players.findIndex(p => p.id === this.rankings.winner);
      if (startingPlayerIndex === -1) startingPlayerIndex = 0;
    }
    this.currentTurn = startingPlayerIndex;
    this.dealerIndex = startingPlayerIndex;
    
    this.addLog({ key: 'log.gameStarted', params: { round: this.roundNumber } });
    
    // Special Rule: 7 identical cards = Instant Win (Game)
    for (const p of this.players) {
      if (this.checkSevenIdentical(this.hands[p.id])) {
        this.handleGameEnd(p.id, false, io);
        return;
      }
    }

    this.broadcastState(io);
    
    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.isBot) {
      executeBotTurn(this, io);
    } else {
      const hand = this.hands[currentPlayer.id];
      if (!hasAnyValidMove(hand, this.publicMelds, currentPlayer.hasBrokenIce)) {
        setTimeout(() => {
          this.passTurn(currentPlayer.id, io);
        }, 1500);
      }
    }
  }

  checkSevenIdentical(hand) {
    const counts = {};
    for (const card of hand) {
      if (card.type !== 'joker') {
        const key = `${card.suit}_${card.value}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] >= 7) return true; // Technically impossible with 2 decks (max 2 cards), but checking per rule
      }
    }
    return false;
  }



  // Player action: play a new meld to the public table
  playMeld(playerId, tiles, io) {
    if (this.status !== 'PLAYING') return false;
    const player = this.players[this.currentTurn];
    if (player.id !== playerId) return false; // Not their turn
    if (player.burned) return false;

    if (!player.hasBrokenIce) {
      // Must be a straight flush to break ice
      if (!isValidStraightFlush(tiles)) {
        return false;
      } else {
        player.hasBrokenIce = true;
      }
    } else {
      // Subsquent plays can be set or straight
      if (!isValidStraightFlush(tiles) && !isValidSet(tiles)) {
        return false; // Invalid play
      }
    }

    // Remove tiles from hand
    this.removeTilesFromHand(playerId, tiles);
    
    const placedTiles = isValidStraightFlush(tiles) ? (isExactValidSequence(tiles) ? tiles : orderStraightFlush(tiles)) : orderSet(tiles);
    placedTiles.forEach(t => { t.newFromPlayer = playerId; t.placedBy = playerId; });
    
    this.publicMelds.push({
      id: Math.random().toString(36).substr(2, 9),
      type: isValidStraightFlush(tiles) ? 'straight' : 'set',
      tiles: placedTiles
    });

    // A move was made, reset consecutive passes
    this.players.forEach(p => p.consecutivePasses = 0);
    this.addLog({ key: 'log.lami.playMeld', params: { name: player.name, tiles: formatLamiTilesForLog(placedTiles) } });

    if (this.hands[playerId].length === 0) {
      this.handleGameEnd(playerId, false, io);
    } else {
      this.moveToNextPlayer(io); // Turn ends after 1 action
    }
    return true;
  }

  connectMeld(playerId, meldId, tiles, position, io) {
    if (this.status !== 'PLAYING') return false;
    const player = this.players[this.currentTurn];
    if (player.id !== playerId) return false;
    if (player.burned || !player.hasBrokenIce) return false; // Must break ice first

    const meld = this.publicMelds.find(m => m.id === meldId);
    if (!meld) return false;

    if (!Array.isArray(tiles)) tiles = [tiles]; // backwards compatibility

    if (meld.type === 'straight') {
      // House Rule: Cannot connect a tile to a straight if a set of that number exists
      // ONLY applies when connecting a single tile
      if (tiles.length === 1) {
        for (const t of tiles) {
          if (t.type !== 'joker') {
            const hasMatchingSet = this.publicMelds.some(m => {
              if (m.type === 'set') {
                const nonJoker = m.tiles.find(c => c.type !== 'joker');
                return nonJoker && nonJoker.value === t.value;
              }
              return false;
            });
            
            if (hasMatchingSet) {
              // Forbidden by house rule
              return false;
            }
          }
        }
      }

      function getPermutations(arr) {
        if (arr.length === 0) return [[]];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = getPermutations(arr.slice(0, i).concat(arr.slice(i + 1)));
          for (const r of rest) {
            result.push([arr[i], ...r]);
          }
        }
        return result;
      }
      
      const perms = tiles.length <= 6 ? getPermutations(tiles) : [tiles];
      let validCopy = null;
      
      for (const p of perms) {
        const testCopy = [...meld.tiles];
        if (position === 'start') {
          testCopy.unshift(...p);
        } else {
          testCopy.push(...p);
        }
        if (isExactValidSequence(testCopy)) {
          validCopy = testCopy;
          break;
        }
      }
      
      if (!validCopy) return false;
      
      tiles.forEach(t => { t.newFromPlayer = playerId; t.placedBy = playerId; });
      meld.tiles = validCopy;
    } else {
      const copy = [...meld.tiles];
      if (position === 'start') {
        copy.unshift(...tiles);
      } else {
        copy.push(...tiles);
      }
      if (!isValidSet(copy)) return false;
      
      tiles.forEach(t => { t.newFromPlayer = playerId; t.placedBy = playerId; });
      meld.tiles = orderSet(copy);
    }

    // Remove tile from hand only if valid
    this.removeTilesFromHand(playerId, tiles);

    // A move was made, reset consecutive passes
    this.players.forEach(p => p.consecutivePasses = 0);
    this.addLog({ key: 'log.lami.connect', params: { name: player.name, tiles: formatLamiTilesForLog(tiles) } });

    if (this.hands[playerId].length === 0) {
      this.handleGameEnd(playerId, false, io);
    } else {
      this.moveToNextPlayer(io); // Turn ends after 1 action
    }
    return true;
  }

  removeTilesFromHand(playerId, tilesToRemove) {
    const hand = this.hands[playerId];
    for (const t of tilesToRemove) {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    }
  }

  passTurn(playerId, io) {
    if (this.status !== 'PLAYING') return;
    const player = this.players[this.currentTurn];
    if (player.id !== playerId) return;

    this.addLog({ key: 'log.lami.pass', params: { name: player.name } });

    player.passedOut = true;

    let activePlayers = 0;
    for (const p of this.players) {
      if (!p.burned && !p.passedOut) {
        activePlayers++;
      }
    }

    if (activePlayers === 0) {
      this.handleGameEnd(null, true, io);
    } else {
      this.moveToNextPlayer(io);
    }
  }

  moveToNextPlayer(io) {
    let nextIdx = this.currentTurn;
    let found = false;
    for (let i = 0; i < this.players.length; i++) {
      nextIdx = (nextIdx + 1) % this.players.length;
      if (!this.players[nextIdx].burned && !this.players[nextIdx].passedOut) {
        found = true;
        break;
      }
    }

    if (!found) {
      this.handleDraw(io);
      return;
    }

    this.currentTurn = nextIdx;
    
    // Clear flags ONLY for the player whose turn is starting!
    const nextPlayerId = this.players[nextIdx].id;
    this.publicMelds.forEach(m => {
      m.tiles.forEach(t => {
        if (t.newFromPlayer === nextPlayerId) {
          delete t.newFromPlayer;
        }
      });
    });

    this.turnStartTime = Date.now();

    this.broadcastState(io);

    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.isBot) {
      executeBotTurn(this, io);
    } else {
      // Auto-pass check
      const hand = this.hands[currentPlayer.id];
      if (!hasAnyValidMove(hand, this.publicMelds, currentPlayer.hasBrokenIce)) {
        setTimeout(() => {
          this.passTurn(currentPlayer.id, io);
        }, 1500);
      }
    }
  }

  calculatePublicJokerAceBonus(playerId) {
    let jokers = 0;
    const aceCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
    
    this.publicMelds.forEach(m => {
      m.tiles.forEach(t => {
        if (t.placedBy === playerId) {
          if (t.type === 'joker') jokers++;
          if (t.value === 1 && t.type !== 'joker') {
            aceCounts[t.suit] = (aceCounts[t.suit] || 0) + 1;
          }
        }
      });
    });

    let coins = jokers * (this.rates?.joker ?? 10);
    
    // Count sets of 4 different aces
    let setsOf4 = Math.min(aceCounts.red, aceCounts.blue, aceCounts.green, aceCounts.yellow);
    coins += setsOf4 * ((this.rates?.ace ?? 5) * 5); // 5 aces worth
    
    let remainingAces = (aceCounts.red - setsOf4) + (aceCounts.blue - setsOf4) + (aceCounts.green - setsOf4) + (aceCounts.yellow - setsOf4);
    coins += remainingAces * (this.rates?.ace ?? 5);

    return {
      value: coins,
      jokers: jokers,
      aces: (setsOf4 * 4) + remainingAces
    };
  }

  handleGameEnd(winnerId, isDraw, io) {
    this.status = 'GAME_OVER';
    if (isDraw) {
      this.addLog({ key: 'log.lami.draw', params: {} });
    } else {
      const winner = this.players.find(p => p.id === winnerId);
      this.addLog({ key: 'log.lami.win', params: { name: winner.name } });
    }

    this.players.forEach(p => {
      if (!p.isBot) p.isReady = false;
    });

    const roundBreakdown = {};
    this.players.forEach(p => {
      roundBreakdown[p.id] = { total: 0, base: 0, jokerAce: 0, handPoints: 0, publicJokers: 0, publicAces: 0 };
    });

    // Calculate hand points to determine ranks
    const playerPoints = this.players.map(p => {
      const points = calculateHandPoints(this.hands[p.id]);
      roundBreakdown[p.id].handPoints = points;
      return { id: p.id, points };
    });

    // Sort ascending (lowest points wins)
    playerPoints.sort((a, b) => a.points - b.points);
    const actualWinnerId = playerPoints[0].id;
    
    // The rest are losers. Sort remaining by highest points -> lowest points to get 大哥, 二哥, 小哥
    const losers = playerPoints.slice(1).sort((a, b) => b.points - a.points);
    
    const multiplier = isDraw ? 1 : 2;

    if (losers.length >= 1) { // 大哥
      const penalty = (this.rates?.win ?? 20) * 3 * multiplier;
      this.accumulatedPoints[losers[0].id] -= penalty;
      this.accumulatedPoints[actualWinnerId] += penalty;
      roundBreakdown[losers[0].id].base -= penalty;
      roundBreakdown[actualWinnerId].base += penalty;
    }
    if (losers.length >= 2) { // 二哥
      const penalty = (this.rates?.win ?? 20) * 2 * multiplier;
      this.accumulatedPoints[losers[1].id] -= penalty;
      this.accumulatedPoints[actualWinnerId] += penalty;
      roundBreakdown[losers[1].id].base -= penalty;
      roundBreakdown[actualWinnerId].base += penalty;
    }
    if (losers.length >= 3) { // 小哥
      const penalty = (this.rates?.win ?? 20) * 1 * multiplier;
      this.accumulatedPoints[losers[2].id] -= penalty;
      this.accumulatedPoints[actualWinnerId] += penalty;
      roundBreakdown[losers[2].id].base -= penalty;
      roundBreakdown[actualWinnerId].base += penalty;
    }

    // All-pairs Joker & Ace settlement
    const playerBonuses = {};
    this.players.forEach(p => {
      const bonusInfo = this.calculatePublicJokerAceBonus(p.id);
      playerBonuses[p.id] = bonusInfo.value;
      roundBreakdown[p.id].publicJokers = bonusInfo.jokers;
      roundBreakdown[p.id].publicAces = bonusInfo.aces;
    });

    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const p1 = this.players[i].id;
        const p2 = this.players[j].id;
        
        const diff = playerBonuses[p1] - playerBonuses[p2];
        if (diff > 0) {
          this.accumulatedPoints[p2] -= diff;
          this.accumulatedPoints[p1] += diff;
          roundBreakdown[p2].jokerAce -= diff;
          roundBreakdown[p1].jokerAce += diff;
        } else if (diff < 0) {
          this.accumulatedPoints[p1] -= (-diff);
          this.accumulatedPoints[p2] += (-diff);
          roundBreakdown[p1].jokerAce -= (-diff);
          roundBreakdown[p2].jokerAce += (-diff);
        }
      }
    }

    this.players.forEach(p => {
      roundBreakdown[p.id].total = roundBreakdown[p.id].base + roundBreakdown[p.id].jokerAce;
      
      const isWin = p.id === actualWinnerId;
      const extraStats = {};

      if (isWin) {
        if (this.hands[p.id].length === 0) extraStats.gamesWonByClear = 1;
        else extraStats.gamesWonByPoints = 1;

        if (this.hands[p.id].length === 20 && this.checkSevenIdentical(this.hands[p.id])) {
          extraStats.lucky7CardCount = 1;
        }
      } else {
        extraStats.totalDeadwoodPoints = roundBreakdown[p.id].handPoints;
        extraStats.deadwoodGamesCount = 1;
      }

      if (p.id === losers[0]?.id) extraStats.brotherhood1st = 1;
      else if (p.id === losers[1]?.id) extraStats.brotherhood2nd = 1;
      else if (p.id === losers[2]?.id) extraStats.brotherhood3rd = 1;

      if (p.burned) extraStats.burntCount = 1;

      const bonusInfo = this.calculatePublicJokerAceBonus(p.id);
      // Recalculate setsOf4 to see if they got 4 aces
      const aceCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
      this.publicMelds.forEach(m => {
        m.tiles.forEach(t => {
          if (t.placedBy === p.id && t.value === 1 && t.type !== 'joker') {
            aceCounts[t.suit] = (aceCounts[t.suit] || 0) + 1;
          }
        });
      });
      const setsOf4 = Math.min(aceCounts.red, aceCounts.blue, aceCounts.green, aceCounts.yellow);
      if (setsOf4 > 0) extraStats.fourAcesCount = setsOf4;

      // Update Firebase stats
      updateLamiPlayerStats(io, p.id, roundBreakdown[p.id].total, isWin, extraStats);
    });

    // Save rankings for frontend dashboard
    this.rankings = {
      winner: actualWinnerId,
      daGe: losers[0]?.id,
      erGe: losers[1]?.id,
      xiaoGe: losers[2]?.id,
      bonuses: playerBonuses,
      breakdown: roundBreakdown
    };

    this.broadcastState(io);
  }
}

module.exports = LamiGameState;
