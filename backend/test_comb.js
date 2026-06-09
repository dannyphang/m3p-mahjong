const { checkCombinations, isValidStraightFlush } = require('./lami_engine.js');

const hand = [
  { value: 10, suit: 'red', type: 'number' },
  { value: 12, suit: 'red', type: 'number' },
  { value: 4, suit: 'blue', type: 'number' },
  { value: 6, suit: 'blue', type: 'number' },
  { value: 9, suit: 'blue', type: 'number' },
  { value: 2, suit: 'green', type: 'number' },
  { value: 7, suit: 'green', type: 'number' },
  { value: 9, suit: 'green', type: 'number' },
  { value: 11, suit: 'green', type: 'number' }, // J
  { value: 12, suit: 'green', type: 'number' }, // Q
  { value: 13, suit: 'green', type: 'number' }, // K
  { value: 13, suit: 'green', type: 'number' }, // K
  { value: 1, suit: 'yellow', type: 'number' }, // A
  { value: 3, suit: 'yellow', type: 'number' },
  { value: 9, suit: 'yellow', type: 'number' },
  { value: 9, suit: 'yellow', type: 'number' },
  { value: 10, suit: 'yellow', type: 'number' }
];

const sf = checkCombinations(hand, 3, isValidStraightFlush);
console.log('SF Found:', sf);
