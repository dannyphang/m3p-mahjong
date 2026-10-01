// backend/poker_engine.js
// Texas Hold'em Poker Engine

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const VALUES = [
  { value: '2', rank: 2 },
  { value: '3', rank: 3 },
  { value: '4', rank: 4 },
  { value: '5', rank: 5 },
  { value: '6', rank: 6 },
  { value: '7', rank: 7 },
  { value: '8', rank: 8 },
  { value: '9', rank: 9 },
  { value: '10', rank: 10 },
  { value: 'J', rank: 11 },
  { value: 'Q', rank: 12 },
  { value: 'K', rank: 13 },
  { value: 'A', rank: 14 }
];

const HAND_TYPES = {
  HIGH_CARD: { rank: 0, name: 'High Card', nameZh: '高牌' },
  ONE_PAIR: { rank: 1, name: 'One Pair', nameZh: '一对' },
  TWO_PAIR: { rank: 2, name: 'Two Pair', nameZh: '两对' },
  THREE_OF_A_KIND: { rank: 3, name: 'Three of a Kind', nameZh: '三条' },
  STRAIGHT: { rank: 4, name: 'Straight', nameZh: '顺子' },
  FLUSH: { rank: 5, name: 'Flush', nameZh: '同花' },
  FULL_HOUSE: { rank: 6, name: 'Full House', nameZh: '葫芦' },
  FOUR_OF_A_KIND: { rank: 7, name: 'Four of a Kind', nameZh: '四条' },
  STRAIGHT_FLUSH: { rank: 8, name: 'Straight Flush', nameZh: '同花顺' },
  ROYAL_FLUSH: { rank: 9, name: 'Royal Flush', nameZh: '皇家同花顺' }
};

function createPokerDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const v of VALUES) {
      deck.push({
        id: `${suit}_${v.rank}`,
        suit,
        value: v.value,
        display: v.value,
        rank: v.rank
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Generates all k-combinations from an array
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = getCombinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

// Evaluates exactly 5 cards
function evaluate5Cards(cards) {
  // Sort descending by rank
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  const isNormalStraight = (
    ranks[0] - ranks[1] === 1 &&
    ranks[1] - ranks[2] === 1 &&
    ranks[2] - ranks[3] === 1 &&
    ranks[3] - ranks[4] === 1
  );

  // Wheel straight (A, 5, 4, 3, 2)
  const isWheelStraight = (
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  );

  if (isNormalStraight) {
    isStraight = true;
    straightHigh = ranks[0];
  } else if (isWheelStraight) {
    isStraight = true;
    straightHigh = 5; // 5 is the highest in A-2-3-4-5
  }

  // Count rank frequencies
  const counts = {};
  for (const r of ranks) {
    counts[r] = (counts[r] || 0) + 1;
  }
  const freqEntries = Object.entries(counts).map(([r, count]) => ({
    rank: parseInt(r, 10),
    count
  })).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.rank - a.rank;
  });

  // 1. Royal Flush / Straight Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        type: HAND_TYPES.ROYAL_FLUSH,
        score: [HAND_TYPES.ROYAL_FLUSH.rank, 14],
        bestCards: sorted
      };
    }
    return {
      type: HAND_TYPES.STRAIGHT_FLUSH,
      score: [HAND_TYPES.STRAIGHT_FLUSH.rank, straightHigh],
      bestCards: sorted
    };
  }

  // 2. Four of a Kind
  if (freqEntries[0].count === 4) {
    const kicker = freqEntries[1].rank;
    return {
      type: HAND_TYPES.FOUR_OF_A_KIND,
      score: [HAND_TYPES.FOUR_OF_A_KIND.rank, freqEntries[0].rank, kicker],
      bestCards: sorted
    };
  }

  // 3. Full House
  if (freqEntries[0].count === 3 && freqEntries[1].count === 2) {
    return {
      type: HAND_TYPES.FULL_HOUSE,
      score: [HAND_TYPES.FULL_HOUSE.rank, freqEntries[0].rank, freqEntries[1].rank],
      bestCards: sorted
    };
  }

  // 4. Flush
  if (isFlush) {
    return {
      type: HAND_TYPES.FLUSH,
      score: [HAND_TYPES.FLUSH.rank, ...ranks],
      bestCards: sorted
    };
  }

  // 5. Straight
  if (isStraight) {
    return {
      type: HAND_TYPES.STRAIGHT,
      score: [HAND_TYPES.STRAIGHT.rank, straightHigh],
      bestCards: sorted
    };
  }

  // 6. Three of a Kind
  if (freqEntries[0].count === 3) {
    const kickers = [freqEntries[1].rank, freqEntries[2].rank];
    return {
      type: HAND_TYPES.THREE_OF_A_KIND,
      score: [HAND_TYPES.THREE_OF_A_KIND.rank, freqEntries[0].rank, ...kickers],
      bestCards: sorted
    };
  }

  // 7. Two Pair
  if (freqEntries[0].count === 2 && freqEntries[1].count === 2) {
    const highPair = Math.max(freqEntries[0].rank, freqEntries[1].rank);
    const lowPair = Math.min(freqEntries[0].rank, freqEntries[1].rank);
    const kicker = freqEntries[2].rank;
    return {
      type: HAND_TYPES.TWO_PAIR,
      score: [HAND_TYPES.TWO_PAIR.rank, highPair, lowPair, kicker],
      bestCards: sorted
    };
  }

  // 8. One Pair
  if (freqEntries[0].count === 2) {
    const kickers = [freqEntries[1].rank, freqEntries[2].rank, freqEntries[3].rank];
    return {
      type: HAND_TYPES.ONE_PAIR,
      score: [HAND_TYPES.ONE_PAIR.rank, freqEntries[0].rank, ...kickers],
      bestCards: sorted
    };
  }

  // 9. High Card
  return {
    type: HAND_TYPES.HIGH_CARD,
    score: [HAND_TYPES.HIGH_CARD.rank, ...ranks],
    bestCards: sorted
  };
}

// Compare two hand evaluation scores (e.g. [rank, kicker1, kicker2, ...])
// Returns 1 if a > b, -1 if a < b, 0 if tie
function compareScores(scoreA, scoreB) {
  const len = Math.max(scoreA.length, scoreB.length);
  for (let i = 0; i < len; i++) {
    const valA = scoreA[i] || 0;
    const valB = scoreB[i] || 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }
  return 0;
}

// Evaluates the best 5-card hand out of 5, 6, or 7 cards
function evaluateHand(cards) {
  if (!cards || cards.length < 5) {
    return {
      type: HAND_TYPES.HIGH_CARD,
      score: [0],
      bestCards: cards || []
    };
  }

  // If exactly 5 cards
  if (cards.length === 5) {
    return evaluate5Cards(cards);
  }

  // If 6 or 7 cards, choose best 5 cards
  const allCombos = getCombinations(cards, 5);
  let bestHand = null;

  for (const combo of allCombos) {
    const evaluated = evaluate5Cards(combo);
    if (!bestHand || compareScores(evaluated.score, bestHand.score) > 0) {
      bestHand = evaluated;
    }
  }

  return bestHand;
}

module.exports = {
  SUITS,
  VALUES,
  HAND_TYPES,
  createPokerDeck,
  shuffleDeck,
  evaluateHand,
  compareScores
};
