const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { 
  createDeck, 
  shuffleDeck, 
  compensateFlowers, 
  canPong, 
  canKong, 
  canChow,
  isWinningHand, 
  calculateFan,
  calculateFlowerPoints,
  calculatePublicPoints,
  isTingPai,
  TILE_TYPES
} = require('./engine');
const LamiGameState = require('./lami_state');
const { db, auth, updatePlayerStats: dbUpdatePlayerStats, getPlayerCoins } = require('./firebase-admin');

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function updatePlayerStats(playerId, netCoins, isWin, fanWon) {
  if (!playerId || playerId.startsWith('bot-')) return;
  try {
    const sockets = await io.fetchSockets();
    const playerSocket = sockets.find(s => s.id === playerId);
    if (!playerSocket || !playerSocket.user) return; // Guest or unauthenticated

    await dbUpdatePlayerStats(playerSocket.user.uid, 'mahjong', netCoins, isWin, fanWon);
  } catch (err) {
    console.error('Failed to update stats for player', playerId, err);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Health check routes to prevent Render inactivity
app.get('/', (req, res) => res.send('M3P Mahjong Backend is alive!'));
app.get('/ping', (req, res) => res.send('pong'));

// Score API for Playground
app.post('/api/score', (req, res) => {
  try {
    const { 
      handTiles, exposedMelds, flowers, winTile,
      isSelfDraw, isReplacement, isRobbingKong, seatWind, roundWind
    } = req.body;
    
    // Check if hand is winning
    const isWin = isWinningHand(handTiles, isSelfDraw);
    if (!isWin) {
      return res.json({ success: true, isWinning: false, result: null });
    }

    const isDealer = seatWind === '东';
    // Calculate Fan
    const result = calculateFan(
      handTiles,
      exposedMelds || [],
      flowers || [],
      winTile || handTiles[handTiles.length - 1],
      isSelfDraw || false,
      isDealer,
      0, // consecutiveDealerWins
      seatWind || '东',
      isReplacement || false, // isHuaShang
      isReplacement || false, // isGangShang
      false, // isTianHu
      false, // isDiHu
      isRobbingKong || false
    );
    
    return res.json({ success: true, isWinning: true, result });
  } catch (error) {
    console.error('Scoring error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Port configuration
const PORT = process.env.PORT || 3000;

// Game rooms in memory
const rooms = {};

// Bot names
const BOT_NAMES = ['Mahjong Master', 'Uncle Lim', 'Auntie Tan', 'M3P Legend', 'Kopi Kia'];

class GameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // { id, name, socketId, isBot: false, isReady: false }
    this.deck = [];
    this.discardedFlowers = []; // Global discarded flowers history
    this.currentTurn = 0; // index of players (0, 1, 2)
    this.dealerIndex = 0; // index of dealer
    this.consecutiveDealerWins = 0;
    this.roundNumber = 0;
    this.status = 'WAITING'; // WAITING, COMPENSATING, PLAYING, GAME_OVER
    this.lastDiscard = null; // { tile, playerId }
    this.lastDrawnTile = null; // { playerId, tile }
    
    // Player hands & exposed blocks
    this.hands = {}; // playerId -> array of tiles
    this.exposed = {}; // playerId -> array of melds { type: 'pong'|'kong', tiles: [...] }
    this.flowers = {}; // playerId -> array of flower/animal tiles
    this.discards = {}; // playerId -> array of discarded tiles
    
    // Claim tracking during a discard
    this.pendingClaims = {}; // playerId -> claimType ('pong'|'kong'|'hu')
    this.claimTimer = null;
    
    // Game logs
    this.logs = [];
    this.accumulatedPoints = {}; // playerId -> net points across rounds
    
    // Win conditions
    this.isHuaShang = false;
    this.isGangShang = false;
    this.currentDrawIsHuaShang = false;
    this.currentDrawIsGangShang = false;
    
    // Room settings
    this.settings = {
      minimumFan: 5,
      enableTimer: false,
      timerDuration: 10
    };
  }

  addLog(msg) {
    this.logs.push(msg);
    if (this.logs.length > 50) this.logs.shift();
  }

  getPlayerWind(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return '东';
    if (idx === this.dealerIndex) return '东';
    if (idx === (this.dealerIndex + 1) % 3) return '南';
    return '西';
  }

  processImmediatePayout(playerId, amount, reason, targetId = null) {
    let received = 0;

    this.players.forEach(p => {
      if (p.id !== playerId) {
        if (!targetId || p.id === targetId) {
          let actualAmount = amount;

          if (actualAmount > 0) {
            this.accumulatedPoints[p.id] -= actualAmount;
            received += actualAmount;
          }
        }
      }
    });
    this.accumulatedPoints[playerId] += received;
    
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      if (targetId) {
        const target = this.players.find(p => p.id === targetId);
        this.addLog({ key: 'log.receivedCoins', params: { name: player.name, coins: received, target: target ? target.name : 'player', reason } });
      } else {
        this.addLog({ key: 'log.receivedCoins', params: { name: player.name, coins: received, target: 'other players', reason } });
      }
    }
  }

  broadcastAnimation(animData) {
    this.players.forEach(p => {
      if (!p.isBot) {
        let dataToSend = { ...animData };
        if (dataToSend.type === 'draw' && dataToSend.playerId !== p.id) {
          dataToSend.tile = { type: 'back' };
        }
        io.to(p.socketId).emit('actionAnim', dataToSend);
      }
    });
  }

  broadcastState() {
    this.players.forEach(p => {
      if (p.isBot) return;
      io.to(p.socketId).emit('gameState', this.getSanitizedState(p.id));
    });
  }

  getSanitizedState(playerId) {
    // Hide other players' hands for security
    const sanitizedHands = {};
    Object.keys(this.hands).forEach(pid => {
      if (pid === playerId) {
        sanitizedHands[pid] = this.hands[pid];
      } else {
        sanitizedHands[pid] = this.hands[pid].map(() => ({ type: 'back' }));
      }
    });

    const flowerPoints = {};
    const publicPoints = {};
    const playerWinds = {};
    const tingPaiState = {};
    this.players.forEach(p => {
      const pWind = this.getPlayerWind(p.id);
      flowerPoints[p.id] = calculateFlowerPoints(this.flowers[p.id] || [], pWind);
      publicPoints[p.id] = calculatePublicPoints(this.flowers[p.id] || [], this.exposed[p.id] || [], pWind);
      playerWinds[p.id] = pWind;
      
      const tingPaiResult = this.hands[p.id].length % 3 === 1 ? isTingPai(this.hands[p.id]) : false;
      if (p.id === playerId) {
        tingPaiState[p.id] = tingPaiResult; // Send array of tiles
      } else {
        tingPaiState[p.id] = !!tingPaiResult; // Send boolean true/false to prevent cheating
      }
    });

    return {
      roomId: this.roomId,
      players: this.players,
      status: this.status,
      roundNumber: this.roundNumber,
      currentTurn: this.currentTurn,
      dealerIndex: this.dealerIndex,
      consecutiveDealerWins: this.consecutiveDealerWins,
      hands: sanitizedHands,
      exposed: this.exposed,
      flowers: this.flowers,
      flowerPoints: flowerPoints,
      publicPoints: publicPoints,
      playerWinds: playerWinds,
      tingPaiState: tingPaiState,
      discards: this.discards,
      lastDiscard: this.lastDiscard,
      lastDrawnTile: this.lastDrawnTile,
      deckRemaining: this.deck.length,
      logs: this.logs,
      accumulatedPoints: this.accumulatedPoints,
      settings: this.settings
    };
  }

  addPlayer(name, socketId, isBot = false, difficulty = 'easy', initialCoins = 100, avatar = null) {
    // Check if player is reconnecting
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
    const player = { id, name, socketId, isBot, isReady: isBot, difficulty: isBot ? difficulty : null, isConnected: true, avatar };
    this.players.push(player);
    
    this.hands[id] = [];
    this.exposed[id] = [];
    this.flowers[id] = [];
    this.discards[id] = [];
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
      
      // If no human players left are connected, clean room
      const activeHumans = this.players.filter(pl => !pl.isBot && pl.isConnected);
      if (activeHumans.length === 0) {
        delete rooms[this.roomId];
      } else {
        this.broadcastState();
      }
    }
  }

  startGame() {
    this.status = 'PLAYING';
    this.roundNumber++;
    this.deck = shuffleDeck(createDeck());
    this.addLog({ key: 'log.gameStarted', params: { round: this.roundNumber } });

    // Deal cards: Dealer gets 14, others 13
    const dealerId = this.players[this.dealerIndex].id;
    for (let i = 0; i < this.players.length; i++) {
      const pid = this.players[i].id;
      const cardsToDeal = pid === dealerId ? 14 : 13;
      this.hands[pid] = this.deck.splice(0, cardsToDeal);
    }

    // Flower Compensation (补花)
    this.players.forEach(p => {
      compensateFlowers(this.hands[p.id], this.deck, this.flowers[p.id]);
    });

    this.currentTurn = this.dealerIndex;
    this.addLog({ key: 'log.dealerTurn', params: { name: this.players[this.dealerIndex].name } });
    this.broadcastState();

    // Check if dealer already has 4 flyers or self-draw win!
    this.checkTurnActions();
  }

  // Draw card for the current player
  drawCard() {
    if (this.status !== 'PLAYING') return;

    if (this.deck.length === 0) {
      this.declareDraw();
      return;
    }

    const currentIsGangShang = this.isGangShang;
    let currentIsHuaShang = this.isHuaShang;

    this.isGangShang = false;
    this.isHuaShang = false;

    const player = this.players[this.currentTurn];
    const tile = this.deck.shift();
    this.hands[player.id].push(tile);
    this.addLog({ key: 'log.draws', params: { name: player.name } });

    // Check if flower / animal
    if (tile.type === TILE_TYPES.FLOWER || tile.type === TILE_TYPES.ANIMAL) {
      currentIsHuaShang = true;
      this.addLog({ key: 'log.flower', params: { name: player.name, tile: tile.display } });
      this.hands[player.id].pop(); // remove from hand
      this.flowers[player.id].push(tile);
      
      // Draw first replacement from the tail end of the deck
      if (this.deck.length > 0) {
        const replacement = this.deck.pop();
        this.hands[player.id].push(replacement);
      }
      
      // Recursively compensate any other flowers in hand
      compensateFlowers(this.hands[player.id], this.deck, this.flowers[player.id]);
    }
    
    // Save the final drawn tile (post-compensation)
    this.lastDrawnTile = { playerId: player.id, tile: this.hands[player.id][this.hands[player.id].length - 1] };
    this.currentDrawIsHuaShang = currentIsHuaShang;
    this.currentDrawIsGangShang = currentIsGangShang;
 
    if (currentIsHuaShang) {
      this.broadcastAnimation({ type: 'buhua', playerId: player.id });
    } else {
      this.broadcastAnimation({ type: 'draw', playerId: player.id, tile: this.lastDrawnTile.tile });
    }

    this.broadcastState();
    this.checkTurnActions();
  }

  checkTurnActions() {
    const player = this.players[this.currentTurn];
    
    // Check if player has Hu (Hu on self draw)
    let wins = false;
    let huFan = 0;
    
    // Only evaluate Self-Hu if the player just drew a tile
    if (this.lastDrawnTile && this.lastDrawnTile.playerId === player.id) {
      wins = isWinningHand(this.hands[player.id]);
      if (wins) {
        const { isTianHu, isDiHu } = this.getTianDiHu(player.id);
        const fanEval = calculateFan(this.hands[player.id], this.exposed[player.id], this.flowers[player.id], this.lastDrawnTile.tile, true, player.id === this.players[this.dealerIndex].id, 0, this.getPlayerWind(player.id), this.currentDrawIsHuaShang, this.currentDrawIsGangShang, isTianHu, isDiHu);
        huFan = fanEval.totalFan;
      }
    }
    
    // Check if player can Kong (in hand)
    // Find if player has 4 of same or matching exposed Pong
    const canSelfKong = this.getSelfKongOptions(player.id);
    
    // Check if player can Replace Joker in exposed melds
    const canReplaceJoker = this.getReplaceJokerOptions(player.id);

    if (player.isBot) {
      // Bot auto acts
      setTimeout(() => {
        if (wins && huFan >= 5) { // Bot only wins if valid minimum 5 fan
          this.executeHu(player.id, null, true);
        } else if (canReplaceJoker.length > 0) {
          const opt = canReplaceJoker[0];
          this.executeReplaceJoker(player.id, opt.meldIndex, opt.tileIndex, opt.handIndex);
        } else if (canSelfKong.length > 0) {
          this.executeSelfKong(player.id, canSelfKong[0]);
        } else {
          this.botDiscard(player.id);
        }
      }, 1500);
    } else {
      // Send turn options to human player
      if (wins || canSelfKong.length > 0 || canReplaceJoker.length > 0) {
        io.to(player.socketId).emit('turnOptions', {
          canHu: wins,
          huFan: huFan,
          canSelfKong: canSelfKong.length > 0 ? canSelfKong : null,
          canReplaceJoker: canReplaceJoker.length > 0 ? canReplaceJoker : null
        });
      } else {
        io.to(player.socketId).emit('turnOptions', null);
      }
    }
  }

  getSelfKongOptions(playerId) {
    const hand = this.hands[playerId];
    const exposed = this.exposed[playerId];
    const options = [];

    // Group hand tiles
    const counts = {};
    hand.forEach(t => {
      if (t.type !== TILE_TYPES.FLY) {
        const key = `${t.type}_${t.value}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    // 1. 4 of same in hand
    Object.keys(counts).forEach(k => {
      if (counts[k] === 4) {
        const [type, value] = k.split('_');
        options.push({ type, value: isNaN(value) ? value : parseInt(value), isUpgrade: false });
      }
    });

    // 2. Pong already exposed, and drawing the 4th matching card
    exposed.forEach(meld => {
      if (meld.type === 'pong') {
        // Cannot upgrade a Pong to a Kong if the Pong contains a Joker!
        const hasFei = meld.tiles.some(t => t.type === TILE_TYPES.FLY);
        if (!hasFei) {
          const matchingTile = hand.find(t => t.type === meld.tiles[0].type && t.value === meld.tiles[0].value);
          if (matchingTile) {
            options.push({ type: matchingTile.type, value: matchingTile.value, isUpgrade: true });
          }
        }
      }
    });

    return options;
  }

  getReplaceJokerOptions(playerId) {
    const hand = this.hands[playerId];
    const exposed = this.exposed[playerId];
    const options = [];

    if (!exposed || exposed.length === 0) return options;

    exposed.forEach((meld, meldIndex) => {
      meld.tiles.forEach((t, tileIndex) => {
        if (t.type === TILE_TYPES.FLY && t.substitutedFor) {
          // Joker found, look for real tile in hand
          const matchIdx = hand.findIndex(ht => 
            ht.type === (t.substitutedType || TILE_TYPES.CIRCLE) && 
            String(ht.value) === String(t.substitutedFor)
          );
          if (matchIdx !== -1) {
            options.push({
              meldIndex,
              tileIndex,
              handIndex: matchIdx,
              tile: hand[matchIdx]
            });
          }
        }
      });
    });

    return options;
  }

  botDiscard(playerId) {
    const hand = this.hands[playerId];
    if (hand.length === 0) return;
    
    const p = this.players.find(pl => pl.id === playerId);
    const difficulty = p.difficulty || 'easy';

    const counts = {};
    hand.forEach(t => {
      if (t.type !== TILE_TYPES.FLY) {
        const key = `${t.type}_${t.value}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    let bestDiscardIndex = -1;
    let lowestScore = 999;

    for (let i = 0; i < hand.length; i++) {
      const tile = hand[i];
      if (tile.type === TILE_TYPES.FLY) continue; // Keep fly card!

      const key = `${tile.type}_${tile.value}`;
      const count = counts[key] || 0;
      let score = count * 10; // lower count is discarded first

      if (tile.type === TILE_TYPES.CIRCLE) {
        score -= 2;
        
        if (difficulty === 'normal' || difficulty === 'hard') {
          // Normal/Hard keeps sequences
          const val = parseInt(tile.value);
          const hasAdj = counts[`${TILE_TYPES.CIRCLE}_${val - 1}`] || counts[`${TILE_TYPES.CIRCLE}_${val + 1}`];
          const hasJump = counts[`${TILE_TYPES.CIRCLE}_${val - 2}`] || counts[`${TILE_TYPES.CIRCLE}_${val + 2}`];
          
          if (hasAdj) score += 5; // Connected sequence
          else if (hasJump) score += 2; // Jump sequence
        }
      }

      if (difficulty === 'hard') {
        // Defensive play late game
        if (this.deck.length < 40) {
          if (tile.type === TILE_TYPES.WIND || tile.type === TILE_TYPES.DRAGON) {
            let seenCount = 0;
            for (const pid in this.discards) {
              seenCount += this.discards[pid].filter(t => t.type === tile.type && t.value === tile.value).length;
            }
            if (seenCount === 0 && count === 1) {
              score += 15; // Dangerous unseen honor
            }
          }
        }
      }

      if (score < lowestScore) {
        lowestScore = score;
        bestDiscardIndex = i;
      }
    }

    if (bestDiscardIndex === -1) {
      bestDiscardIndex = 0;
    }

    const discardedTile = hand.splice(bestDiscardIndex, 1)[0];
    this.executeDiscard(playerId, discardedTile);
  }

  executeDiscard(playerId, tile) {
    this.lastDrawnTile = null; // Clear last drawn card indicator when someone discards
    this.lastDiscard = { tile, playerId };
    this.discards[playerId].push(tile);
    const p = this.players.find(pl => pl.id === playerId);
    this.addLog({ key: 'log.discards', params: { name: p.name, tile: tile.display } });
    this.broadcastAnimation({ type: 'discard', playerId, tile });
    this.broadcastState();

    // Check if other players can claim (Pong, Kong, Hu)
    this.checkClaims(playerId, tile);
  }

  checkClaims(discarderId, tile, isRobbingKong = false) {
    this.pendingClaims = {};
    this.activeClaimers = []; // Track exactly who has claim options

    this.players.forEach(p => {
      if (p.id === discarderId) return;

      const hand = this.hands[p.id];
      // Check if they can Hu on this discard (Minimum 5 fan logic for bot, show all for human with huFan)
      const testHand = [...hand, tile];
      const wins = isWinningHand(testHand);
      let canClaimHu = false;
      let huFan = 0;
      if (wins) {
        const { isTianHu, isDiHu } = this.getTianDiHu(p.id);
        const fanEval = calculateFan(testHand, this.exposed[p.id], this.flowers[p.id], tile, false, p.id === this.players[this.dealerIndex].id, 0, this.getPlayerWind(p.id), false, false, isTianHu, isDiHu, isRobbingKong);
        huFan = fanEval.totalFan;
        canClaimHu = true;
      }

      let canClaimPong = false;
      let canClaimKong = false;
      let canClaimChow = false;
      let chowOptions = null;

      if (!isRobbingKong) {
        canClaimPong = canPong(hand, tile);
        canClaimKong = canKong(hand, tile);

        // Check if eligible to Chow (only from的上家, meaning p is the next player in order)
        const discarderIdx = this.players.findIndex(pl => pl.id === discarderId);
        const isNextPlayer = p.id === this.players[(discarderIdx + 1) % 3].id;
        if (isNextPlayer) {
          chowOptions = canChow(hand, tile);
          if (chowOptions) {
            canClaimChow = true;
          }
        }
      }

      if (canClaimHu || canClaimPong || canClaimKong || canClaimChow) {
        this.activeClaimers.push(p.id);
        if (p.isBot) {
          // Bots auto claim after short delay
          setTimeout(() => {
            const difficulty = p.difficulty || 'easy';
            
            if (canClaimHu && huFan >= 5) {
              this.registerClaim(p.id, 'hu');
            } else if (canClaimKong) {
              this.registerClaim(p.id, 'kong');
            } else if (canClaimPong) {
              this.registerClaim(p.id, 'pong');
            } else if (canClaimChow) {
              if (difficulty === 'normal' || difficulty === 'hard') {
                const exposedCount = this.exposed[p.id].length;
                if (exposedCount >= 2 || Math.random() > 0.5) {
                  this.registerClaim(p.id, 'chow', chowOptions[0]); // Claim first valid Chow option
                } else {
                  this.registerClaim(p.id, 'pass');
                }
              } else {
                this.registerClaim(p.id, 'pass'); // Easy bots prefer pass
              }
            } else {
              this.registerClaim(p.id, 'pass');
            }
          }, 1000);
        } else {
          io.to(p.socketId).emit('claimOptions', {
            tile,
            canHu: canClaimHu,
            huFan: huFan,
            canPong: canClaimPong,
            canKong: canClaimKong,
            canChow: chowOptions
          });
        }
      }
    });

    if (this.activeClaimers.length === 0) {
      // Resolve claims immediately (handles pendingRobbingKong success or moves to next player)
      this.resolveClaims();
    } else {
      // Start a timer for human players to decide ONLY if enabled
      if (this.settings.enableTimer) {
        const duration = (this.settings.timerDuration || 10) * 1000;
        this.claimTimer = setTimeout(() => {
          // Auto-pass anyone who hasn't responded
          this.activeClaimers.forEach(pid => {
            if (this.pendingClaims[pid] === undefined) {
              this.registerClaim(pid, 'pass');
              // Notify frontend to clear options
              const p = this.players.find(pl => pl.id === pid);
              if (p && !p.isBot) {
                io.to(p.socketId).emit('claimOptions', null);
              }
            }
          });
        }, duration);
      }
    }
  }

  registerClaim(playerId, claimType) {
    this.pendingClaims[playerId] = claimType;

    // Check if all players with active options have responded
    const allResponded = this.activeClaimers.every(pid => this.pendingClaims[pid] !== undefined);

    if (allResponded) {
      if (this.claimTimer) clearTimeout(this.claimTimer);
      this.resolveClaims();
    }
  }

  resolveClaims() {
    if (this.claimTimer) clearTimeout(this.claimTimer);

    let bestClaim = null;
    let claimerId = null;
    let bestClaimQuality = -1;
    let bestClaimerDistance = 4;

    const claimedTile = this.lastDiscard ? this.lastDiscard.tile : null;
    const discarderIdx = this.lastDiscard ? this.players.findIndex(p => p.id === this.lastDiscard.playerId) : -1;

    this.players.forEach((p, idx) => {
      const claim = this.pendingClaims[p.id];
      if (!claim || claim === 'pass') return;

      let claimPriority = 0;
      let claimQuality = 0;
      
      if (claim === 'hu') claimPriority = 4;
      else if (claim === 'kong') claimPriority = 3;
      else if (claim === 'pong') {
        claimPriority = 2;
        if (claimedTile) {
          const realCount = this.hands[p.id].filter(t => t.type === claimedTile.type && String(t.value) === String(claimedTile.value)).length;
          claimQuality = realCount >= 2 ? 2 : 1; // 2 for Real, 1 for Joker
        }
      }
      else if (claim.startsWith('chow_')) claimPriority = 1;

      // Distance from discarder (1 for next player, 2 for opposite)
      let distance = (idx - discarderIdx + 3) % 3;
      if (distance === 0) distance = 3;

      let replace = false;
      if (!bestClaim) {
        replace = true;
      } else {
        const currentBestPriority = 
          bestClaim === 'hu' ? 4 : 
          bestClaim === 'kong' ? 3 : 
          bestClaim === 'pong' ? 2 : 1;
        
        if (claimPriority > currentBestPriority) {
          replace = true;
        } else if (claimPriority === currentBestPriority) {
          if (claimPriority === 2) { // Pong tie
            if (claimQuality > bestClaimQuality) {
              replace = true; // Real pong beats Joker pong
            } else if (claimQuality === bestClaimQuality) {
              if (distance < bestClaimerDistance) {
                replace = true; // Closest player wins tie
              }
            }
          } else {
            if (distance < bestClaimerDistance) {
              replace = true; // Closest player wins tie
            }
          }
        }
      }

      if (replace) {
        bestClaim = claim;
        claimerId = p.id;
        bestClaimQuality = claimQuality;
        bestClaimerDistance = distance;
      }
    });

    if (bestClaim) {
      const claimer = this.players.find(p => p.id === claimerId);
      const discarder = this.players.find(p => p.id === this.lastDiscard.playerId);
      
      // Mark tile in discarder's discards as claimed
      const discarderDiscards = this.discards[discarder.id];
      if (discarderDiscards.length > 0) {
        discarderDiscards[discarderDiscards.length - 1].claimed = true;
      }
      const claimedTile = this.lastDiscard.tile;

      if (bestClaim === 'hu') {
        this.executeHu(claimerId, claimedTile, false, this.pendingRobbingKong != null);
        this.pendingRobbingKong = null; // Kong failed
      } else if (bestClaim === 'pong') {
        this.executePong(claimerId, claimedTile);
      } else if (bestClaim === 'kong') {
        this.executeKong(claimerId, claimedTile);
      } else if (bestClaim.startsWith('chow_')) {
        this.executeChow(claimerId, claimedTile, bestClaim);
      }
      
      this.lastDiscard = null;
    } else {
      // No claims
      if (this.pendingRobbingKong) {
        // Robbing Kong failed, so the Kong succeeds!
        const { playerId, exposedPong, matchingTile } = this.pendingRobbingKong;
        const player = this.players.find(p => p.id === playerId);
        
        exposedPong.type = 'kong';
        exposedPong.tiles.push(matchingTile);
        this.addLog({ key: 'log.upgradeKong', params: { name: player.name, tile: matchingTile.display } });
        this.processImmediatePayout(playerId, 1, '加杠 (Add Kong)');
        
        this.pendingRobbingKong = null;
        this.broadcastState();
        
        this.isGangShang = true;
        this.drawCard();
      } else {
        this.moveToNextPlayer();
      }
    }

    this.pendingClaims = {};
  }

  executePong(claimerId, tile) {
    const hand = this.hands[claimerId];
    const claimer = this.players.find(p => p.id === claimerId);
    
    let t1 = null, t2 = null;
    for (let i = hand.length - 1; i >= 0; i--) {
      if (hand[i].type === tile.type && hand[i].value === tile.value) {
        if (!t1) t1 = hand.splice(i, 1)[0];
        else if (!t2) t2 = hand.splice(i, 1)[0];
      }
    }
    while (!t1 || !t2) {
      const jokerIdx = hand.findIndex(t => t.type === TILE_TYPES.FLY);
      if (jokerIdx !== -1) {
        const joker = hand.splice(jokerIdx, 1)[0];
        joker.substitutedFor = tile.value;
        joker.substitutedType = tile.type;
        if (!t1) t1 = joker;
        else t2 = joker;
      } else break;
    }

    // Add Pong meld to exposed
    this.exposed[claimerId].push({
      type: 'pong',
      tiles: [tile, t1, t2]
    });

    this.addLog({ key: 'log.pongs', params: { name: claimer.name, tile: tile.display } });
    this.currentTurn = this.players.findIndex(p => p.id === claimerId);
    this.broadcastAnimation({ type: 'pong', playerId: claimerId, tile });
    this.broadcastState();

    // Player needs to discard now
    this.checkTurnActions();
  }

  executeChow(claimerId, tile, claimString) {
    const hand = this.hands[claimerId];
    const claimer = this.players.find(p => p.id === claimerId);
    
    // Parse values to remove from hand, e.g. chow_1_2 -> remove Circle 1 and 2
    const parts = claimString.split('_');
    const v1 = parseInt(parts[1], 10);
    const v2 = parseInt(parts[2], 10);

    let t1 = null, t2 = null;

    for (let i = hand.length - 1; i >= 0; i--) {
      const t = hand[i];
      if (t.type === TILE_TYPES.CIRCLE) {
        if (!t1 && parseInt(t.value, 10) === v1) {
          t1 = hand.splice(i, 1)[0];
        } else if (!t2 && parseInt(t.value, 10) === v2) {
          t2 = hand.splice(i, 1)[0];
        }
      }
    }
    
    if (!t1) {
      const jokerIdx = hand.findIndex(t => t.type === TILE_TYPES.FLY);
      if (jokerIdx !== -1) {
        t1 = hand.splice(jokerIdx, 1)[0];
        t1.substitutedFor = v1;
        t1.substitutedType = TILE_TYPES.CIRCLE;
      }
    }
    if (!t2) {
      const jokerIdx = hand.findIndex(t => t.type === TILE_TYPES.FLY);
      if (jokerIdx !== -1) {
        t2 = hand.splice(jokerIdx, 1)[0];
        t2.substitutedFor = v2;
        t2.substitutedType = TILE_TYPES.CIRCLE;
      }
    }

    const meldTiles = [t1, t2, tile].sort((a, b) => {
      const valA = a.type === TILE_TYPES.FLY ? a.substitutedFor : parseInt(a.value, 10);
      const valB = b.type === TILE_TYPES.FLY ? b.substitutedFor : parseInt(b.value, 10);
      return valA - valB;
    });

    this.exposed[claimerId].push({
      type: 'chow',
      tiles: meldTiles
    });

    this.addLog({ key: 'log.chows', params: { name: claimer.name, tiles: meldTiles.map(t => t.display).join(', ') } });
    this.currentTurn = this.players.findIndex(p => p.id === claimerId);
    this.broadcastAnimation({ type: 'chow', playerId: claimerId, tile });
    this.broadcastState();

    // Player needs to discard now
    this.checkTurnActions();
  }

  executeKong(claimerId, tile) {
    const hand = this.hands[claimerId];
    const claimer = this.players.find(p => p.id === claimerId);
    
    // First try to remove matching tiles
    let removed = 0;
    for (let i = hand.length - 1; i >= 0; i--) {
      if (hand[i].type === tile.type && hand[i].value === tile.value) {
        hand.splice(i, 1);
        removed++;
        if (removed === 3) break;
      }
    }
    // Remove Jokers if needed
    while (removed < 3) {
      const jokerIdx = hand.findIndex(t => t.type === TILE_TYPES.FLY);
      if (jokerIdx !== -1) {
        hand.splice(jokerIdx, 1);
        removed++;
      } else {
        break;
      }
    }

    this.exposed[claimerId].push({
      type: 'kong',
      tiles: [tile, { ...tile }, { ...tile }, { ...tile }]
    });

    this.addLog({ key: 'log.declaresKong', params: { name: claimer.name, tile: tile.display } });
    const discarderId = this.lastDiscard ? this.lastDiscard.playerId : null;
    this.processImmediatePayout(claimerId, 2, '明杠 (Exposed Kong)', discarderId);
    this.currentTurn = this.players.findIndex(p => p.id === claimerId);
    this.broadcastAnimation({ type: 'kong', playerId: claimerId, tile });
    this.broadcastState();
    
    // Draw compensation tile from the back of the deck (Kongs require compensation)
    this.isGangShang = true;
    this.drawCard();
  }

  executeReplaceJoker(playerId, meldIndex, tileIndex, handIndex) {
    const player = this.players.find(p => p.id === playerId);
    const hand = this.hands[playerId];
    const exposed = this.exposed[playerId];

    if (!hand || !exposed || !exposed[meldIndex] || !exposed[meldIndex].tiles[tileIndex] || !hand[handIndex]) return;

    // Swap the tile from hand with the Joker in the meld
    const realTile = hand.splice(handIndex, 1)[0];
    const jokerTile = exposed[meldIndex].tiles.splice(tileIndex, 1, realTile)[0];

    // Clear substitute properties
    delete jokerTile.substitutedFor;
    delete jokerTile.substitutedType;

    // Mark as rescued so it doesn't give extra points/settlements
    jokerTile.isRescued = true;

    // Put Joker into hand
    hand.push(jokerTile);

    // Update lastDrawnTile to the rescued Joker so that if they Hu, it shows winning with Fei
    this.lastDrawnTile = { playerId: player.id, tile: jokerTile };
    
    // Clear replacement bonuses because rescuing a Fei breaks the "winning on replacement" chain
    this.currentDrawIsHuaShang = false;
    this.currentDrawIsGangShang = false;

    this.addLog(`${player.name} rescued a 飞 (Joker) by substituting a ${realTile.display}!`);
    this.broadcastState();

    // Re-check turn actions (the player might now be able to self-kong, Hu, or replace another)
    this.checkTurnActions();
  }

  executeSelfKong(playerId, option) {
    const hand = this.hands[playerId];
    const exposed = this.exposed[playerId];
    const player = this.players.find(p => p.id === playerId);

    // Find if it is a hand Kong (4 identical tiles) or exposed Kong (Pong already exposed, drawing the 4th)
    const exposedPong = exposed.find(meld => meld.type === 'pong' && meld.tiles[0].type === option.type && meld.tiles[0].value === option.value);

    if (exposedPong) {
      // 1. Upgrade exposed Pong to Kong (Ming Gang) - Robbing Kong check
      const idx = hand.findIndex(t => t.type === option.type && t.value === option.value);
      const matchingTile = hand.splice(idx, 1)[0];
      
      this.pendingRobbingKong = {
        playerId,
        matchingTile,
        exposedPong
      };

      this.lastDrawnTile = null;
      this.lastDiscard = { tile: matchingTile, playerId }; // Pretend it's a discard for claims
      this.addLog({ key: 'log.attemptsUpgrade', params: { name: player.name, tile: matchingTile.display } });
      this.broadcastAnimation({ type: 'kong', playerId, tile: matchingTile });
      this.broadcastState();

      // Trigger claims for Robbing Kong (only Hu is allowed)
      this.checkClaims(playerId, matchingTile, true);
    } else {
      // 2. Clear Kong from hand (Dark Kong - Cannot be robbed)
      let removedTiles = [];
      for (let i = hand.length - 1; i >= 0; i--) {
        if (hand[i].type === option.type && hand[i].value === option.value) {
          removedTiles.push(hand.splice(i, 1)[0]);
        }
      }

      this.exposed[playerId].push({
        type: 'kong',
        tiles: removedTiles
      });
      this.addLog({ key: 'log.darkKong', params: { name: player.name, tile: option.value + (option.type === TILE_TYPES.CIRCLE ? '筒' : '') } });
      this.processImmediatePayout(playerId, 2, '暗杠 (Dark Kong)');
      this.broadcastAnimation({ type: 'kong', playerId });
      this.broadcastState();
      
      // Kong compensation draw
      this.isGangShang = true;
      this.drawCard();
    }
  }

  executeDunFei(playerId) {
    const hand = this.hands[playerId];
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    // Find a Fly Joker (飞) in hand
    const flyIdx = hand.findIndex(t => t.type === TILE_TYPES.FLY);
    if (flyIdx !== -1) {
      const flyTile = hand.splice(flyIdx, 1)[0];
      this.flowers[playerId].push(flyTile);
      this.addLog(`${player.name} exposes Joker (炖飞)!`);
      
      this.broadcastState();
      // Draw compensation card
      this.drawCard();
    }
  }

  executeHu(winnerId, tile, isSelfDraw, isRobbingKong = false) {
    const winner = this.players.find(p => p.id === winnerId);
    let winningTile = tile;
    if (isSelfDraw) {
      winningTile = this.lastDrawnTile ? this.lastDrawnTile.tile : this.hands[winnerId][this.hands[winnerId].length - 1];
    }
    
    let finalHand = [...this.hands[winnerId]];
    if (tile && !isSelfDraw) {
      finalHand.push(tile);
    }

    const { isTianHu, isDiHu } = this.getTianDiHu(winnerId);

    // Calculate score
    const isDealer = winnerId === this.players[this.dealerIndex].id;
    const scoreResult = calculateFan(
      finalHand, 
      this.exposed[winnerId], 
      this.flowers[winnerId], 
      winningTile, 
      isSelfDraw, 
      isDealer,
      this.consecutiveDealerWins,
      this.getPlayerWind(winnerId),
      isSelfDraw ? this.currentDrawIsHuaShang : false,
      isSelfDraw ? this.currentDrawIsGangShang : false,
      isTianHu,
      isDiHu,
      isRobbingKong
    );

    this.status = 'GAME_OVER';
    this.addLog({ key: 'log.hu', params: { name: winner.name, fan: scoreResult.totalFan } });

    // Calculate coin adjustments
    // Base rate: 1 Fan = 1 coin, up to 9 Fan = 9 coins. 10 Fan (limit) = 12 coins.
    let baseCoins = scoreResult.totalFan;
    if (baseCoins >= 10) baseCoins = 12;
    
    const settlements = {};

    this.players.forEach(p => {
      settlements[p.id] = 0;
    });

    if (isSelfDraw || isTianHu || isDiHu) {
      // Self draw or Tian/Di Hu: All other players pay winner x1
      this.players.forEach(p => {
        if (p.id === winnerId) return;

        const multiplier = 1;
        const payout = baseCoins * multiplier;
        settlements[p.id] -= payout;
        settlements[winnerId] += payout;
      });
    } else {
      // Win on discard: Discarder pays winner x1.5
      const discarderId = this.lastDiscard ? this.lastDiscard.playerId : this.players[this.currentTurn].id;

      const multiplier = 1.5;
      const payout = baseCoins * multiplier;
      settlements[discarderId] -= payout;
      settlements[winnerId] += payout;
    }

    // Calculate End-of-Round Fei Settlements
    const totalFeis = {};
    const allHands = {};
    this.players.forEach(p => {
      const flowerFeis = this.flowers[p.id].filter(f => f.type === 'fly').length;
      const handFeis = this.hands[p.id].filter(t => t.type === 'fly' && !t.isRescued).length;
      const publicFeis = (this.exposed[p.id] || []).reduce((count, meld) => {
        return count + meld.tiles.filter(t => t.type === 'fly' && !t.isRescued).length;
      }, 0);
      
      totalFeis[p.id] = flowerFeis + handFeis + publicFeis;
      allHands[p.id] = p.id === winnerId ? finalHand : [...this.hands[p.id]];
    });

    const feiSettlements = {};
    this.players.forEach(p => feiSettlements[p.id] = 0);
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const p1 = this.players[i].id;
        const p2 = this.players[j].id;
        const diff = totalFeis[p1] - totalFeis[p2];
        if (diff !== 0) {
          feiSettlements[p1] += diff;
          feiSettlements[p2] -= diff;
        }
      }
    }

    // Apply settlements to accumulated points
    this.players.forEach(p => {
      this.accumulatedPoints[p.id] += settlements[p.id] + feiSettlements[p.id];
    });

    // Calculate next dealer index for the next round (don't apply it to current state yet)
    if (winnerId === this.players[this.dealerIndex].id) {
      this.nextConsecutiveDealerWins = this.consecutiveDealerWins + 1;
      this.nextDealerIndex = this.dealerIndex;
    } else {
      // Winner Takes Dealer (赢家做庄)
      this.nextDealerIndex = this.players.findIndex(p => p.id === winnerId);
      this.nextConsecutiveDealerWins = 0;
    }

    // Broadcast winner details
    this.broadcastAnimation({ type: 'hu', playerId: winnerId, tile: winningTile });

    io.to(this.roomId).emit('gameOver', {
      winner: winner.name,
      hand: finalHand,
      winningTile,
      exposed: this.exposed[winnerId],
      flowers: this.flowers[winnerId],
      scoreResult,
      settlements,
      feiSettlements,
      allHands,
      totalFeis,
      isSelfDraw,
      isTianHu,
      isDiHu
    });

    this.broadcastState();

    // Firebase: Update Stats
    this.players.forEach(p => {
      const netCoins = settlements[p.id] + feiSettlements[p.id];
      const isWin = p.id === winnerId;
      const fanWon = isWin ? scoreResult.totalFan : 0;
      updatePlayerStats(p.id, netCoins, isWin, fanWon);
    });
  }

  declareDraw() {
    this.status = 'GAME_OVER';
    this.addLog('Deck empty. Game is a Draw (流局)!');
    this.nextConsecutiveDealerWins = this.consecutiveDealerWins + 1; // Dealer連庄
    this.nextDealerIndex = this.dealerIndex;

    const totalFeis = {};
    const allHands = {};
    this.players.forEach(p => {
      const flowerFeis = this.flowers[p.id].filter(f => f.type === 'fly').length;
      const handFeis = this.hands[p.id].filter(t => t.type === 'fly' && !t.isRescued).length;
      const publicFeis = (this.exposed[p.id] || []).reduce((count, meld) => {
        return count + meld.tiles.filter(t => t.type === 'fly' && !t.isRescued).length;
      }, 0);
      
      totalFeis[p.id] = flowerFeis + handFeis + publicFeis;
      allHands[p.id] = [...this.hands[p.id]];
    });

    const feiSettlements = {};
    const settlements = {};
    this.players.forEach(p => {
      feiSettlements[p.id] = 0;
      settlements[p.id] = 0;
    });

    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const p1 = this.players[i].id;
        const p2 = this.players[j].id;
        const diff = totalFeis[p1] - totalFeis[p2];
        if (diff !== 0) {
          feiSettlements[p1] += diff;
          feiSettlements[p2] -= diff;
        }
      }
    }

    this.players.forEach(p => {
      this.accumulatedPoints[p.id] += feiSettlements[p.id];
    });

    io.to(this.roomId).emit('gameOver', {
      draw: true,
      settlements,
      feiSettlements,
      allHands,
      totalFeis
    });
    this.broadcastState();

    // Firebase: Update Stats
    this.players.forEach(p => {
      const netCoins = feiSettlements[p.id] || 0;
      updatePlayerStats(p.id, netCoins, false, 0);
    });
  }

  moveToNextPlayer() {
    if (this.status !== 'PLAYING') return;
    this.currentTurn = (this.currentTurn + 1) % 3;
    this.broadcastState();
    this.drawCard();
  }

  getTianDiHu(playerId) {
    let totalDiscards = 0;
    this.players.forEach(p => {
      totalDiscards += (this.discards[p.id] ? this.discards[p.id].length : 0);
    });

    const isDealer = playerId === this.players[this.dealerIndex].id;
    const isTianHu = totalDiscards === 0 && isDealer;
    
    // Di Hu: Non-dealer wins before they have discarded anything.
    // AND it must be within the first round (total discards <= 2).
    const isDiHu = !isDealer && this.discards[playerId].length === 0 && totalDiscards <= 2;

    return { isTianHu, isDiHu };
  }
}

// Socket IO Lobby events
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    // For local dev without auth or backward compatibility, allow connection
    // But ideal is to throw error: return next(new Error('Authentication error: No token provided'));
    socket.user = null;
    return next();
  }
  try {
    const decodedToken = await auth.verifyIdToken(token);
    socket.user = decodedToken;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    return next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}, User: ${socket.user ? socket.user.uid : 'Guest'}`);

  // Create or Join Room
  socket.on('joinRoom', async ({ name, roomId, gameType, avatar }) => {
    let room = rooms[roomId];
    if (!room) {
      if (gameType === 'lami') {
        room = new LamiGameState(roomId);
      } else {
        room = new GameState(roomId);
      }
      rooms[roomId] = room;
    }

    const maxPlayers = room.gameType === 'lami' ? 4 : 3;
    const isReconnecting = room.players.some(p => p.name === name && !p.isBot && p.isConnected === false);
    
    if (room.players.length >= maxPlayers && !isReconnecting) {
      socket.emit('errorMsg', 'Room is already full.');
      return;
    }

    socket.join(roomId);
    
    // Fetch initial coins from Firebase for humans, fallback to default (1000 for lami, 100 for mahjong)
    let initialCoins = gameType === 'lami' ? 1000 : 100;
    if (socket.user && socket.user.uid) {
      const dbCoins = await getPlayerCoins(socket.user.uid);
      if (dbCoins !== null && dbCoins !== undefined) {
        initialCoins = dbCoins;
      }
    }

    let addedPlayer;
    if (gameType === 'lami') {
      addedPlayer = room.addPlayer(name, socket.id, false, initialCoins, avatar);
    } else {
      addedPlayer = room.addPlayer(name, socket.id, false, 'easy', initialCoins, avatar);
    }
    
    if (addedPlayer) {
      socket.emit('joined', { playerId: addedPlayer.id, gameType: room.gameType });
      
      if (room.gameType === 'lami') {
        room.broadcastState(io);
      } else {
        room.broadcastState();
      }
    }
  });

  // Toggle Ready
  socket.on('toggleReady', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const p = room.players.find(pl => pl.id === playerId);
    if (p) {
      p.isReady = !p.isReady;
      room.addLog({ key: 'log.ready', params: { name: p.name, status: p.isReady ? 'READY' : 'NOT READY' } });
      
      if (room.gameType === 'lami') room.broadcastState(io);
      else room.broadcastState();
    }
  });

  // Add a Bot
  socket.on('addBot', ({ roomId, difficulty }) => {
    const room = rooms[roomId];
    if (room && room.status === 'WAITING') {
      const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      
      if (room.gameType === 'lami') {
        room.addPlayer(botName, null, true); // initialCoins defaults to 1000
      } else {
        room.addPlayer(botName, null, true, difficulty || 'easy'); // initialCoins defaults to 100
      }
      
      if (room.gameType === 'lami') room.broadcastState(io);
      else room.broadcastState();
    }
  });

  // Remove a Bot
  socket.on('removeBot', ({ roomId, botId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'WAITING') {
      const idx = room.players.findIndex(p => p.id === botId && p.isBot);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        
        // Also cleanup their state arrays
        delete room.hands[botId];
        delete room.exposed?.[botId];
        delete room.flowers?.[botId];
        delete room.discards?.[botId];
        delete room.accumulatedPoints?.[botId];

        if (room.gameType === 'lami') room.broadcastState(io);
        else room.broadcastState();
      }
    }
  });

  // Kick a Player
  socket.on('kickPlayer', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'WAITING') {
      // Security check: Only the host can kick (host is players[0])
      if (room.players[0] && room.players[0].id !== socket.id) return;
      // Cannot kick yourself
      if (playerId === socket.id) return;

      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx !== -1) {
        const kickedPlayer = room.players[idx];
        room.players.splice(idx, 1);
        
        // Also cleanup their state arrays
        delete room.hands[playerId];
        delete room.exposed?.[playerId];
        delete room.flowers?.[playerId];
        delete room.discards?.[playerId];
        delete room.accumulatedPoints?.[playerId];

        // Notify the kicked player if they are not a bot
        if (!kickedPlayer.isBot && kickedPlayer.socketId) {
          io.to(kickedPlayer.socketId).emit('kickedFromRoom');
        }

        if (room.gameType === 'lami') room.broadcastState(io);
        else room.broadcastState();
      }
    }
  });

  // --- LAMI SPECIFIC EVENTS ---

  socket.on('lamiUpdateRates', ({ roomId, playerId, rates }) => {
    const room = rooms[roomId];
    if (room && room.gameType === 'lami' && room.status === 'WAITING') {
      if (room.players[0] && room.players[0].id === playerId) {
        room.rates = { ...room.rates, ...rates };
        room.broadcastState(io);
      }
    }
  });
  socket.on('lamiSortHand', ({ roomId, playerId, sortedHand }) => {
    const room = rooms[roomId];
    if (room && room.gameType === 'lami' && room.status === 'PLAYING') {
      if (room.hands[playerId]) {
        // Keep only valid tiles to prevent cheating
        const validSorted = [];
        const serverHand = [...room.hands[playerId]];
        for (const st of sortedHand) {
          const idx = serverHand.findIndex(t => t.id === st.id);
          if (idx !== -1) {
            validSorted.push(serverHand.splice(idx, 1)[0]);
          }
        }
        // Add any leftovers
        validSorted.push(...serverHand);
        room.hands[playerId] = validSorted;
        room.broadcastState(io);
      }
    }
  });
  socket.on('lamiPlayMeld', ({ roomId, playerId, tiles }) => {
    const room = rooms[roomId];
    if (room && room.gameType === 'lami') {
      room.playMeld(playerId, tiles, io);
    }
  });

  socket.on('lamiConnectMeld', ({ roomId, playerId, meldId, tiles, position }) => {
    const room = rooms[roomId];
    if (room && room.gameType === 'lami') {
      room.connectMeld(playerId, meldId, tiles, position, io);
    }
  });

  socket.on('lamiPassTurn', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (room && room.gameType === 'lami') {
      room.passTurn(playerId, io);
    }
  });
  // -----------------------------

  socket.on('updateTimer', ({ roomId, enableTimer, timerDuration }) => {
    const room = rooms[roomId];
    if (room && room.status === 'WAITING') {
      if (room.settings) {
        room.settings.enableTimer = !!enableTimer;
        room.settings.timerDuration = parseInt(timerDuration, 10) || 10;
      }
      if (room.gameType === 'lami') room.broadcastState(io);
      else room.broadcastState();
    }
  });

  // Discard action
  socket.on('discard', ({ roomId, playerId, tile }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING') return;

    const hand = room.hands[playerId];
    const idx = hand.findIndex(t => t.type === tile.type && String(t.value) === String(tile.value));
    if (idx !== -1) {
      const discardedTile = hand[idx];
      if (discardedTile.type === TILE_TYPES.FLY) {
        if (discardedTile.isRescued) {
          socket.emit('errorMsg', 'Cannot expose a rescued Joker (不能炖补回来的飞).');
          return;
        }
        // Expose the flyer (炖飞) instead of normal discard!
        hand.splice(idx, 1);
        room.flowers[playerId].push(discardedTile);
        room.addLog(`${room.players.find(p => p.id === playerId)?.name} exposes Joker (炖飞)!`);
        room.broadcastState();
        // Draw compensation card
        room.isHuaShang = true;
        room.drawCard();
      } else {
        // Normal discard
        hand.splice(idx, 1);
        room.executeDiscard(playerId, discardedTile);
      }
    }
  });

  // Human player claim response
  socket.on('claimResponse', ({ roomId, playerId, claimType }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.registerClaim(playerId, claimType);
  });

  // Human player turn choice
  socket.on('declareSelfKong', ({ roomId, playerId, option }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.executeSelfKong(playerId, option);
  });

  socket.on('declareSelfHu', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.executeHu(playerId, null, true);
  });

  socket.on('declareDunFei', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.executeDunFei(playerId);
  });

  socket.on('replaceJoker', ({ roomId, playerId, opt }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.executeReplaceJoker(playerId, opt.meldIndex, opt.tileIndex, opt.handIndex);
  });

  // Start Game (Manual Trigger by Host)
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // Check if caller is host
    if (room.players.length === 0 || room.players[0].id !== socket.id) return;

    const maxPlayers = room.gameType === 'lami' ? 4 : 3;
    const allReady = room.players.length === maxPlayers && room.players.every(pl => pl.isReady);
    
    if (allReady && room.status === 'WAITING') {
      if (room.gameType === 'lami') room.startGame(io);
      else room.startGame();
    }
  });

  // Reset/Restart Game
  socket.on('restartGame', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.status !== 'WAITING') {
      // Apply the pending dealer updates now that the next round is starting
      if (room.nextDealerIndex !== undefined) {
        room.dealerIndex = room.nextDealerIndex;
        room.consecutiveDealerWins = room.nextConsecutiveDealerWins;
        room.nextDealerIndex = undefined;
        room.nextConsecutiveDealerWins = undefined;
      }

      room.status = 'WAITING';
      room.lastDiscard = null;
      room.logs = [];
      room.players.forEach(p => {
        p.isReady = p.isBot; // bots stay ready
        room.hands[p.id] = [];
        if (room.gameType !== 'lami') {
          room.exposed[p.id] = [];
          room.flowers[p.id] = [];
          room.discards[p.id] = [];
        }
      });
      room.addLog({ key: 'log.roomReset' });
    }

    if (playerId) {
      const p = room.players.find(pl => pl.id === playerId);
      if (p) {
        p.isReady = true;
        room.addLog({ key: 'log.ready', params: { name: p.name, status: 'READY' } });
      }
    }

    if (room.gameType === 'lami') room.broadcastState(io);
    else room.broadcastState();
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      const shouldDestroy = room.removePlayer(socket.id);
      if (shouldDestroy) {
        delete rooms[roomId];
      } else {
        if (room.gameType === 'lami') room.broadcastState(io);
        else room.broadcastState();
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
