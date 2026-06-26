// backend/test_laizi.js
// Verification tests for Dou Dizhu Laizi (Wildcard) mode

const { createDizhuDeck, parseHand, compareHands } = require('./dizhu_engine');

function testLaizi() {
  const deck = createDizhuDeck();
  console.log('Testing Laizi mode...');

  // Helper to find cards
  const findCard = (val, suit) => deck.find(c => c.value === val && c.suit === suit);
  const bj = deck.find(c => c.value === 'black_joker');
  const rj = deck.find(c => c.value === 'red_joker');

  // Let's set wildcard to Rank 5 (Value '5')
  const wildcardRank = 5; // Rank of 5 is 5

  // 1. Wildcard played alone acts only as native rank (no wildcard effect)
  const singleWildcard = [findCard('5', 'hearts')];
  const parsedSingle = parseHand(singleWildcard, wildcardRank);
  console.assert(parsedSingle.type === 'single', 'Should be single');
  console.assert(parsedSingle.rank === 5, 'Should represent rank 5 (native)');

  // 2. Wildcard substitution in pair: 6 + Wildcard (5) = pair of 6s
  const pairWithWildcard = [findCard('6', 'hearts'), findCard('5', 'diamonds')];
  const parsedPair = parseHand(pairWithWildcard, wildcardRank);
  console.assert(parsedPair.type === 'pair', 'Should be pair');
  console.assert(parsedPair.rank === 6, 'Should represent pair of 6s');

  // 2.1 Pure wildcard pair: 5 + 5 = pair of 5s (original rank)
  const pureWildcardPair = [findCard('5', 'hearts'), findCard('5', 'diamonds')];
  const parsedPurePair = parseHand(pureWildcardPair, wildcardRank);
  console.assert(parsedPurePair.type === 'pair', 'Should be pair');
  console.assert(parsedPurePair.rank === 5, 'Pure wildcard pair must represent native rank 5');

  // 3. Bomb Power Order: soft_bomb < hard_bomb < laizi_bomb < mega_bomb < rocket
  // soft_bomb: three 6s + one wildcard 5 (rank 6)
  const softBomb = [
    findCard('6', 'hearts'), findCard('6', 'spades'), findCard('6', 'clubs'),
    findCard('5', 'diamonds')
  ];
  // hard_bomb: four 6s
  const hardBomb = [
    findCard('6', 'hearts'), findCard('6', 'spades'), findCard('6', 'clubs'), findCard('6', 'diamonds')
  ];
  // laizi_bomb: four wildcards (four 5s)
  const laiziBomb = [
    findCard('5', 'hearts'), findCard('5', 'spades'), findCard('5', 'clubs'), findCard('5', 'diamonds')
  ];
  // mega_bomb: four 6s + one wildcard 5 (rank 6) -> 5-card bomb
  const megaBomb5 = [
    findCard('6', 'hearts'), findCard('6', 'spades'), findCard('6', 'clubs'), findCard('6', 'diamonds'),
    findCard('5', 'diamonds')
  ];
  // mega_bomb: four 7s + one wildcard 5 (rank 7) -> 5-card bomb
  const megaBomb7 = [
    findCard('7', 'hearts'), findCard('7', 'spades'), findCard('7', 'clubs'), findCard('7', 'diamonds'),
    findCard('5', 'diamonds')
  ];
  const rocket = [bj, rj];

  const pSoft = parseHand(softBomb, wildcardRank);
  const pHard = parseHand(hardBomb, wildcardRank);
  const pLaizi = parseHand(laiziBomb, wildcardRank);
  const pMega5 = parseHand(megaBomb5, wildcardRank);
  const pMega7 = parseHand(megaBomb7, wildcardRank);

  console.assert(pSoft.type === 'bomb' && pSoft.bombType === 'soft_bomb', 'Should be soft_bomb');
  console.assert(pHard.type === 'bomb' && pHard.bombType === 'hard_bomb', 'Should be hard_bomb');
  console.assert(pLaizi.type === 'bomb' && pLaizi.bombType === 'laizi_bomb', 'Should be laizi_bomb');
  console.assert(pMega5.type === 'bomb' && pMega5.bombType === 'mega_bomb', 'Should be mega_bomb');

  // Assert comparison order
  console.assert(compareHands(softBomb, hardBomb, wildcardRank) === true, 'hard_bomb beats soft_bomb');
  console.assert(compareHands(hardBomb, laiziBomb, wildcardRank) === true, 'laizi_bomb beats hard_bomb');
  console.assert(compareHands(laiziBomb, megaBomb5, wildcardRank) === true, 'mega_bomb beats laizi_bomb');
  console.assert(compareHands(megaBomb5, megaBomb7, wildcardRank) === true, 'mega_bomb 7 beats mega_bomb 6');
  console.assert(compareHands(megaBomb5, rocket, wildcardRank) === true, 'rocket beats mega_bomb');

  // 4. Straights with wildcards
  // straight of length 5: 3, 4, Wildcard(5), 6, 7
  const straightWithWildcard = [
    findCard('3', 'hearts'),
    findCard('4', 'spades'),
    findCard('5', 'diamonds'),
    findCard('6', 'clubs'),
    findCard('7', 'diamonds')
  ];
  const pStraight = parseHand(straightWithWildcard, wildcardRank);
  console.assert(pStraight.type === 'straight', 'Should be straight');
  console.assert(pStraight.rank === 7, 'Should be straight ending in 7');

  console.log('Laizi mode tests passed successfully!');
}

testLaizi();
