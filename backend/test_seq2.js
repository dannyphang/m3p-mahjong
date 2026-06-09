const { isExactValidSequence } = require('./lami_engine.js');

const cards = [
  { value: 2, suit: 'yellow', type: 'number' },
  { type: 'joker' }, // 3
  { value: 4, suit: 'yellow', type: 'number' },
  { value: 5, suit: 'yellow', type: 'number' },
  { value: 6, suit: 'yellow', type: 'number' },
  { value: 7, suit: 'yellow', type: 'number' },
  { value: 8, suit: 'yellow', type: 'number' },
  { value: 9, suit: 'yellow', type: 'number' },
  { value: 10, suit: 'yellow', type: 'number' },
  { value: 11, suit: 'yellow', type: 'number' },
  { value: 12, suit: 'yellow', type: 'number' },
  { value: 13, suit: 'yellow', type: 'number' },
  { value: 1, suit: 'yellow', type: 'number' } // A
];

console.log('Result:', isExactValidSequence(cards));
