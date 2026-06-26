const { parseHandAll } = require('./dizhu_engine');
const cards = [
  { rank: 7, isWildcard: true, suit: 'hearts' },
  { rank: 7, isWildcard: true, suit: 'spades' },
  { rank: 7, isWildcard: true, suit: 'diamonds' },
  { rank: 7, isWildcard: true, suit: 'clubs' },
  { rank: 3, isWildcard: false, suit: 'hearts' }
];

const start = Date.now();
const res = parseHandAll(cards, 7);
console.log("Time:", Date.now() - start, "ms", "Results:", res.length);
