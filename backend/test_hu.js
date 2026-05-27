const { isWinningHand, TILE_TYPES } = require('./engine.js');

const hand = [
  { type: 'circle', value: '4' },
  { type: 'circle', value: '4' },
  { type: 'circle', value: '7' },
  { type: 'circle', value: '7' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '东' },
  { type: 'honor', value: '发' },
  { type: 'circle', value: '3' },
  { type: 'circle', value: '3' }
];

const tile = { type: 'circle', value: '3' };

console.log(isWinningHand(hand, tile));
