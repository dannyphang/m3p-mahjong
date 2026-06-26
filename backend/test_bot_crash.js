const { executeDizhuBotTurn } = require('./dizhu_bot');
const DizhuGameState = require('./dizhu_state');

const state = new DizhuGameState('room1');
state.settings.mode = 'noshuffle_laizi';
state.wildcardRank = 7;
state.status = 'PLAYING';
state.players = [
  { id: 'p1', name: 'Auntie Tan', isBot: true, difficulty: 'normal' },
  { id: 'p2', name: 'Danny Phang', isBot: false },
  { id: 'p3', name: 'Kopi Kia', isBot: true, difficulty: 'normal' }
];
state.currentTurn = 0;

state.hands['p1'] = [
  { id: 'c1', suit: 'hearts', value: '4', rank: 4 },
  { id: 'c2', suit: 'spades', value: '4', rank: 4 }
];
state.hands['p2'] = [];
state.hands['p3'] = [];

state.lastPlayedHand = {
  playerId: 'p3',
  cards: [
    { id: 'k1', suit: 'clubs', value: 'K', rank: 13 },
    { id: 'k2', suit: 'diamonds', value: 'K', rank: 13 }
  ],
  type: 'pair',
  rank: 13
};

try {
  executeDizhuBotTurn(state, { to: () => ({ emit: () => {} }) });
  console.log("No crash. Bot passed?", state.passCount);
} catch (e) {
  console.error(e);
}
