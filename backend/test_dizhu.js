// backend/test_dizhu.js
// Verification tests for Dou Dizhu engine

const { createDizhuDeck, parseHand, compareHands } = require('./dizhu_engine');

function test() {
  const deck = createDizhuDeck();
  console.log('Deck created, total cards:', deck.length);

  // Helper to find a card in deck
  const findCard = (val, suit) => deck.find(c => c.value === val && c.suit === suit);
  const bj = deck.find(c => c.value === 'black_joker');
  const rj = deck.find(c => c.value === 'red_joker');

  // 1. Single tests
  const single3 = [findCard('3', 'hearts')];
  const single4 = [findCard('4', 'spades')];
  console.assert(parseHand(single3).type === 'single', 'Should be single');
  console.assert(compareHands(single3, single4) === true, '4 beats 3');
  console.assert(compareHands(single4, single3) === false, '3 does not beat 4');

  // 2. Pairs
  const pair3 = [findCard('3', 'hearts'), findCard('3', 'spades')];
  const pair4 = [findCard('4', 'hearts'), findCard('4', 'spades')];
  console.assert(parseHand(pair3).type === 'pair', 'Should be pair');
  console.assert(compareHands(pair3, pair4) === true, 'Pair 4 beats Pair 3');

  // 3. Bombs and Rocket
  const bomb3 = [findCard('3', 'hearts'), findCard('3', 'spades'), findCard('3', 'clubs'), findCard('3', 'diamonds')];
  const rocket = [bj, rj];
  console.assert(parseHand(bomb3).type === 'bomb', 'Should be bomb');
  console.assert(parseHand(rocket).type === 'rocket', 'Should be rocket');
  console.assert(compareHands(pair4, bomb3) === true, 'Bomb beats pair');
  console.assert(compareHands(bomb3, rocket) === true, 'Rocket beats bomb');

  // 4. Straights
  const straight5 = [
    findCard('3', 'hearts'),
    findCard('4', 'spades'),
    findCard('5', 'clubs'),
    findCard('6', 'diamonds'),
    findCard('7', 'hearts')
  ];
  console.assert(parseHand(straight5).type === 'straight', 'Should be straight');

  // 5. Plane with wings
  // 333 + 444 + 5 + 6 (8 cards)
  const plane1 = [
    findCard('3', 'hearts'), findCard('3', 'spades'), findCard('3', 'clubs'),
    findCard('4', 'hearts'), findCard('4', 'spades'), findCard('4', 'clubs'),
    findCard('5', 'hearts'),
    findCard('6', 'spades')
  ];
  console.assert(parseHand(plane1).type === 'plane_wings', 'Should be plane with single wings');

  console.log('All tests passed successfully!');
}

test();
