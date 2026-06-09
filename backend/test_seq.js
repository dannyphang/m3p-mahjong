const { isExactValidSequence } = require('./lami_engine.js');

const cards = [
  { value: 3, suit: 'blue', type: 'number' },
  { value: 4, suit: 'blue', type: 'number' },
  { value: 5, suit: 'blue', type: 'number' },
  { value: 6, suit: 'blue', type: 'number' },
  { value: 7, suit: 'blue', type: 'number' },
  { value: 8, suit: 'blue', type: 'number' },
  { value: 9, suit: 'blue', type: 'number' },
  { value: 10, suit: 'blue', type: 'number' },
  { value: 11, type: 'joker' },
  { value: 12, suit: 'blue', type: 'number' }, // Q
  { value: 13, suit: 'blue', type: 'number' }, // K
  { value: 1, suit: 'blue', type: 'number' },  // A
];

console.log('Result:', isExactValidSequence(cards));
