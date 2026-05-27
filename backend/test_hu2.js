const { isWinningHand, TILE_TYPES } = require('./engine.js');

const hand = [
  { type: 'circle', value: '2' },
  { type: 'circle', value: '2' },
  { type: 'circle', value: '2' },
  { type: 'circle', value: '7' },
  { type: 'circle', value: '7' },
  { type: 'circle', value: '7' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '发' },
  { type: 'honor', value: '发' },
  { type: 'fly', value: '飞' },
  { type: 'honor', value: '白' } // The discard
];

console.log("Is Winning:", isWinningHand(hand));
