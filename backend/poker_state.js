// backend/poker_state.js
// Texas Hold'em Poker Game State

const { createPokerDeck, shuffleDeck, evaluateHand, compareScores } = require('./poker_engine');
const { decidePokerBotAction } = require('./poker_bot');
const { updatePlayerStats: dbUpdatePlayerStats } = require('./firebase-admin');

async function updatePokerStats(io, playerId, netCoins, isWin, extraStats = {}) {
  if (!playerId || playerId.startsWith('bot-') || playerId.startsWith('bot_')) return;
  try {
    const sockets = await io.fetchSockets();
    const playerSocket = sockets.find(s => s.id === playerId);
    if (!playerSocket || !playerSocket.user) return;

    await dbUpdatePlayerStats(playerSocket.user.uid, 'poker', netCoins, isWin, extraStats);
  } catch (err) {
    console.error('Failed to update stats for poker player', playerId, err);
  }
}

class PokerGameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.gameType = 'poker';
    this.players = []; // { id, name, socketId, isBot, isReady, coins, avatar, difficulty, folded, allIn }
    this.status = 'WAITING'; // WAITING, BETTING, SHOWDOWN, GAME_OVER
    this.stage = 'PREFLOP'; // PREFLOP, FLOP, TURN, RIVER, SHOWDOWN
    this.roundNumber = 0;
    this.deck = [];
    this.communityCards = []; // Up to 5 cards
    this.hands = {}; // playerId -> [card1, card2]
    
    // Pot & Bet tracking
    this.pot = 0;
    this.accumulatedPoints = {};
    this.currentBet = 0; // Highest bet in current street
    this.minRaise = 0;
    this.roundBets = {}; // playerId -> bet this street
    this.totalContributions = {}; // playerId -> total chips put in this hand
    this.actedThisStreet = {}; // playerId -> boolean

    // Positional indices
    this.dealerIndex = 0;
    this.currentTurn = 0;
    
    // Settings
    this.settings = {
      smallBlind: 10,
      bigBlind: 20,
      enableTimer: false,
      timerDuration: 15
    };

    this.logs = [];
    this.winners = []; // Winners of current hand
    this.timer = null;
  }

  addLog(msg) {
    this.logs.push(msg);
    if (this.logs.length > 50) this.logs.shift();
  }

  addPlayer(name, socketId, isBot = false, difficulty = 'normal', initialCoins = 1000, avatar = null) {
    const id = isBot ? `bot-${Math.random().toString(36).substr(2, 6)}` : socketId;
    const existing = this.players.find(p => p.id === id);
    if (existing) {
      existing.name = name;
      existing.socketId = socketId;
      existing.isConnected = true;
      return existing;
    }

    const player = {
      id,
      name,
      socketId,
      isBot,
      difficulty,
      isReady: isBot,
      coins: initialCoins ?? 1000,
      avatar,
      folded: false,
      allIn: false,
      isConnected: true
    };

    this.players.push(player);
    this.hands[id] = [];
    this.roundBets[id] = 0;
    this.totalContributions[id] = 0;
    this.addLog({ key: 'poker.log.playerJoined', params: { name } });
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx !== -1) {
      const p = this.players[idx];
      this.addLog({ key: 'poker.log.playerLeft', params: { name: p.name } });
      this.players.splice(idx, 1);
      delete this.hands[p.id];
      delete this.roundBets[p.id];
      delete this.totalContributions[p.id];

      if (this.players.length === 0) return true; // destroy room

      // If playing and it was their turn, auto-fold or advance
      if (this.status === 'BETTING') {
        this.checkOnlyOnePlayerLeft();
      }
    }
    return false;
  }

  startGame(io) {
    if (this.players.length < 2) return;
    this.status = 'BETTING';
    this.stage = 'PREFLOP';
    this.roundNumber++;
    this.deck = shuffleDeck(createPokerDeck());
    this.communityCards = [];
    this.pot = 0;
    this.winners = [];
    this.logs = [];

    // Reset player round flags
    this.players.forEach(p => {
      p.folded = false;
      p.allIn = p.coins <= 0;
      this.hands[p.id] = [];
      this.roundBets[p.id] = 0;
      this.totalContributions[p.id] = 0;
      this.actedThisStreet[p.id] = false;
    });

    // Rotate dealer button
    if (this.roundNumber > 1) {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    // Deal 2 hole cards to each player
    for (let i = 0; i < 2; i++) {
      this.players.forEach(p => {
        if (this.deck.length > 0) {
          this.hands[p.id].push(this.deck.pop());
        }
      });
    }

    // Post Blinds
    const sbAmount = this.settings.smallBlind || 10;
    const bbAmount = this.settings.bigBlind || 20;

    let sbIndex, bbIndex;
    if (this.players.length === 2) {
      // Heads up: Dealer is SB, other player is BB
      sbIndex = this.dealerIndex;
      bbIndex = (this.dealerIndex + 1) % 2;
    } else {
      sbIndex = (this.dealerIndex + 1) % this.players.length;
      bbIndex = (this.dealerIndex + 2) % this.players.length;
    }

    this.postBlind(this.players[sbIndex], sbAmount, 'Small Blind');
    this.postBlind(this.players[bbIndex], bbAmount, 'Big Blind');

    this.currentBet = bbAmount;
    this.minRaise = bbAmount;

    // Action starts left of Big Blind (Under The Gun)
    if (this.players.length === 2) {
      this.currentTurn = sbIndex; // Dealer acts first preflop in heads up
    } else {
      this.currentTurn = (bbIndex + 1) % this.players.length;
    }

    this.addLog({ key: 'poker.log.handStarted', params: { round: this.roundNumber } });
    this.broadcastState(io);
    this.processCurrentTurn(io);
  }

  postBlind(player, amount, blindName) {
    const actual = Math.min(player.coins, amount);
    player.coins -= actual;
    this.pot += actual;
    this.roundBets[player.id] = actual;
    this.totalContributions[player.id] = actual;
    if (player.coins === 0) player.allIn = true;
    this.addLog({ key: 'poker.log.postBlind', params: { name: player.name, blindName, amount: actual } });
  }

  broadcastState(io) {
    this.players.forEach(p => {
      if (p.isBot || !p.socketId) return;
      io.to(p.socketId).emit('gameState', this.getSanitizedState(p.id));
    });
  }

  getSanitizedState(playerId) {
    const sanitizedHands = {};
    const handEvaluations = {};

    this.players.forEach(p => {
      const isShowdown = this.status === 'SHOWDOWN' || this.status === 'GAME_OVER';
      if (p.id === playerId || (isShowdown && !p.folded)) {
        sanitizedHands[p.id] = this.hands[p.id] || [];
        if (this.communityCards.length >= 3 && this.hands[p.id]?.length === 2) {
          const evalRes = evaluateHand([...this.hands[p.id], ...this.communityCards]);
          handEvaluations[p.id] = {
            rankName: evalRes.type.name,
            rankNameZh: evalRes.type.nameZh,
            rank: evalRes.type.rank
          };
        }
      } else {
        sanitizedHands[p.id] = (this.hands[p.id] || []).map(() => ({ type: 'back' }));
      }
    });

    return {
      roomId: this.roomId,
      gameType: this.gameType,
      players: this.players,
      status: this.status,
      stage: this.stage,
      roundNumber: this.roundNumber,
      dealerIndex: this.dealerIndex,
      currentTurn: this.currentTurn,
      pot: this.pot,
      accumulatedPoints: this.accumulatedPoints,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      roundBets: this.roundBets,
      communityCards: this.communityCards,
      hands: sanitizedHands,
      handEvaluations,
      winners: this.winners,
      logs: this.logs,
      settings: this.settings
    };
  }

  handlePlayerAction(playerId, action, raiseToAmount, io) {
    if (this.status !== 'BETTING') return;
    const curPlayer = this.players[this.currentTurn];
    if (!curPlayer || curPlayer.id !== playerId) return;

    const myCurrentBet = this.roundBets[playerId] || 0;
    const toCall = this.currentBet - myCurrentBet;

    switch (action) {
      case 'fold': {
        curPlayer.folded = true;
        this.addLog({ key: 'poker.log.fold', params: { name: curPlayer.name } });
        break;
      }

      case 'check': {
        if (toCall > 0) return; // Cannot check if there is a bet to call
        this.addLog({ key: 'poker.log.check', params: { name: curPlayer.name } });
        break;
      }

      case 'call': {
        const callAmount = Math.min(curPlayer.coins, toCall);
        curPlayer.coins -= callAmount;
        this.pot += callAmount;
        this.roundBets[playerId] = myCurrentBet + callAmount;
        this.totalContributions[playerId] = (this.totalContributions[playerId] || 0) + callAmount;
        if (curPlayer.coins === 0) curPlayer.allIn = true;
        this.addLog({ key: 'poker.log.call', params: { name: curPlayer.name, amount: callAmount } });
        break;
      }

      case 'raise': {
        const targetBet = Math.min(myCurrentBet + curPlayer.coins, Math.max(this.currentBet + this.minRaise, raiseToAmount || 0));
        const needed = targetBet - myCurrentBet;
        if (needed <= 0 || curPlayer.coins < needed) return;

        curPlayer.coins -= needed;
        this.pot += needed;
        const raiseDifference = targetBet - this.currentBet;
        if (raiseDifference > this.minRaise) {
          this.minRaise = raiseDifference;
        }
        this.currentBet = targetBet;
        this.roundBets[playerId] = targetBet;
        this.totalContributions[playerId] = (this.totalContributions[playerId] || 0) + needed;
        if (curPlayer.coins === 0) curPlayer.allIn = true;

        // Reset acted for all other active players since bet was raised
        this.players.forEach(p => {
          if (p.id !== playerId && !p.folded && !p.allIn) {
            this.actedThisStreet[p.id] = false;
          }
        });

        this.addLog({ key: 'poker.log.raise', params: { name: curPlayer.name, amount: targetBet } });
        break;
      }

      case 'allIn': {
        const allInAmount = curPlayer.coins;
        const targetBet = myCurrentBet + allInAmount;
        curPlayer.coins = 0;
        curPlayer.allIn = true;
        this.pot += allInAmount;
        this.totalContributions[playerId] = (this.totalContributions[playerId] || 0) + allInAmount;

        if (targetBet > this.currentBet) {
          const raiseDiff = targetBet - this.currentBet;
          if (raiseDiff > this.minRaise) this.minRaise = raiseDiff;
          this.currentBet = targetBet;
          this.roundBets[playerId] = targetBet;
          // Re-open action
          this.players.forEach(p => {
            if (p.id !== playerId && !p.folded && !p.allIn) {
              this.actedThisStreet[p.id] = false;
            }
          });
        } else {
          this.roundBets[playerId] = targetBet;
        }

        this.addLog({ key: 'poker.log.allIn', params: { name: curPlayer.name, amount: allInAmount } });
        break;
      }
    }

    this.actedThisStreet[playerId] = true;
    this.broadcastState(io);

    // Check if hand is won by default (only 1 player not folded)
    if (this.checkOnlyOnePlayerLeft(io)) return;

    // Check if betting street is finished
    if (this.isStreetComplete()) {
      this.nextStreet(io);
    } else {
      this.advanceTurn(io);
    }
  }

  isStreetComplete() {
    const active = this.players.filter(p => !p.folded);
    const nonAllIn = active.filter(p => !p.allIn);

    // If 0 or 1 non-all-in player left, street ends
    if (nonAllIn.length <= 1) {
      // If someone still owes chips to meet currentBet, they must act
      const allMatched = active.every(p => this.roundBets[p.id] === this.currentBet || p.allIn);
      return allMatched;
    }

    // All active non-all-in players have acted and matched the current bet
    return nonAllIn.every(p => this.actedThisStreet[p.id] && this.roundBets[p.id] === this.currentBet);
  }

  advanceTurn(io) {
    const numPlayers = this.players.length;
    let nextIdx = (this.currentTurn + 1) % numPlayers;
    let loops = 0;

    while ((this.players[nextIdx].folded || this.players[nextIdx].allIn) && loops < numPlayers) {
      nextIdx = (nextIdx + 1) % numPlayers;
      loops++;
    }

    this.currentTurn = nextIdx;
    this.broadcastState(io);
    this.processCurrentTurn(io);
  }

  nextStreet(io) {
    // Reset street bets
    this.players.forEach(p => {
      this.roundBets[p.id] = 0;
      this.actedThisStreet[p.id] = false;
    });
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind || 20;

    // Deal community cards according to stage
    if (this.stage === 'PREFLOP') {
      this.stage = 'FLOP';
      // Burn 1 card
      this.deck.pop();
      // Deal 3 Flop cards
      for (let i = 0; i < 3; i++) {
        if (this.deck.length > 0) this.communityCards.push(this.deck.pop());
      }
      this.addLog({ key: 'poker.log.dealFlop' });
    } else if (this.stage === 'FLOP') {
      this.stage = 'TURN';
      this.deck.pop(); // Burn
      if (this.deck.length > 0) this.communityCards.push(this.deck.pop());
      this.addLog({ key: 'poker.log.dealTurn' });
    } else if (this.stage === 'FLOP' || this.stage === 'TURN') {
      this.stage = 'RIVER';
      this.deck.pop(); // Burn
      if (this.deck.length > 0) this.communityCards.push(this.deck.pop());
      this.addLog({ key: 'poker.log.dealRiver' });
    } else {
      // Reached showdown after River
      this.handleShowdown(io);
      return;
    }

    // Check if remaining players are all all-in (auto run to showdown)
    const active = this.players.filter(p => !p.folded);
    const nonAllIn = active.filter(p => !p.allIn);

    if (nonAllIn.length <= 1) {
      this.broadcastState(io);
      setTimeout(() => {
        if (this.stage !== 'RIVER') {
          this.nextStreet(io);
        } else {
          this.handleShowdown(io);
        }
      }, 1200);
      return;
    }

    // First active player left of Dealer acts first post-flop
    let firstTurn = (this.dealerIndex + 1) % this.players.length;
    while (this.players[firstTurn].folded || this.players[firstTurn].allIn) {
      firstTurn = (firstTurn + 1) % this.players.length;
    }
    this.currentTurn = firstTurn;

    this.broadcastState(io);
    this.processCurrentTurn(io);
  }

  checkOnlyOnePlayerLeft(io) {
    const active = this.players.filter(p => !p.folded);
    if (active.length === 1) {
      const winner = active[0];
      const winAmount = this.pot;
      winner.coins += winAmount;
      this.winners = [{
        player: winner,
        amount: winAmount,
        handType: null
      }];

      this.addLog({ key: 'poker.log.winDefault', params: { name: winner.name, amount: winAmount } });
      this.status = 'SHOWDOWN';
      this.stage = 'SHOWDOWN';

      // Update stats
      if (io) {
        this.players.forEach(p => {
          const isWinner = p.id === winner.id;
          const net = isWinner ? winAmount - (this.totalContributions[p.id] || 0) : -(this.totalContributions[p.id] || 0);
          updatePokerStats(io, p.id, net, isWinner);
        });
      }

      this.broadcastState(io);
      return true;
    }
    return false;
  }

  handleShowdown(io) {
    this.status = 'SHOWDOWN';
    this.stage = 'SHOWDOWN';

    // Ensure all 5 community cards are dealt for evaluation
    while (this.communityCards.length < 5 && this.deck.length > 0) {
      this.communityCards.push(this.deck.pop());
    }

    const active = this.players.filter(p => !p.folded);
    const evaluations = active.map(p => {
      const allSeven = [...(this.hands[p.id] || []), ...this.communityCards];
      const res = evaluateHand(allSeven);
      return {
        player: p,
        evaluation: res
      };
    });

    // Sort best hand first
    evaluations.sort((a, b) => compareScores(b.evaluation.score, a.evaluation.score));

    // Handle single winner or split pot
    const bestScore = evaluations[0].evaluation.score;
    const tiedWinners = evaluations.filter(e => compareScores(e.evaluation.score, bestScore) === 0);

    const share = Math.floor(this.pot / tiedWinners.length);
    this.winners = tiedWinners.map(tw => {
      tw.player.coins += share;
      return {
        player: tw.player,
        amount: share,
        handType: tw.evaluation.type.name,
        handTypeZh: tw.evaluation.type.nameZh,
        bestCards: tw.evaluation.bestCards
      };
    });

    tiedWinners.forEach(w => {
      this.addLog({
        key: 'poker.log.showdownWin',
        params: {
          name: w.player.name,
          handType: w.evaluation.type.nameZh,
          amount: share
        }
      });
    });

    // Update stats for all players
    if (io) {
      this.players.forEach(p => {
        const isWinner = tiedWinners.some(tw => tw.player.id === p.id);
        const contributed = this.totalContributions[p.id] || 0;
        const net = isWinner ? share - contributed : -contributed;
        const bestHandName = evaluations.find(e => e.player.id === p.id)?.evaluation?.type?.name;
        updatePokerStats(io, p.id, net, isWinner, { bestHand: bestHandName });
      });
    }

    this.broadcastState(io);
  }

  processCurrentTurn(io) {
    if (this.status !== 'BETTING') return;
    const curPlayer = this.players[this.currentTurn];
    if (!curPlayer) return;

    // If bot, execute AI turn after delay
    if (curPlayer.isBot) {
      setTimeout(() => {
        if (this.status !== 'BETTING' || this.currentTurn !== this.players.findIndex(p => p.id === curPlayer.id)) return;
        const botDecision = decidePokerBotAction(curPlayer, this);
        this.handlePlayerAction(curPlayer.id, botDecision.action, botDecision.amount, io);
      }, 1000 + Math.random() * 800);
    }
  }
}

module.exports = PokerGameState;
