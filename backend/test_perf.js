const { parseHandAll } = require('./dizhu_engine');
const start = Date.now();

const cards = [
  { rank: 7, isWildcard: true, suit: 'hearts' },
  { rank: 7, isWildcard: true, suit: 'spades' },
  { rank: 7, isWildcard: true, suit: 'diamonds' },
  { rank: 7, isWildcard: true, suit: 'clubs' },
  { rank: 3, isWildcard: false, suit: 'hearts' }
];

// parseHandAll with 4 wildcards and 1 normal card
// Wait, we need to modify dizhu_engine.js to allow 3..15 temporarily to measure it.
