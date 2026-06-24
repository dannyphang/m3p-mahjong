// backend/dizhu_engine.js
// Engine for Dou Dizhu (斗地主) Game Mode

const SUITS = ['hearts', 'spades', 'clubs', 'diamonds'];
const VALUES = [
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
  { value: 'A', rank: 14 },
  { value: '2', rank: 15 }
];

function createDizhuDeck() {
  const deck = [];
  let idCounter = 0;
  for (const suit of SUITS) {
    for (const v of VALUES) {
      deck.push({
        id: `card_${idCounter++}`,
        suit,
        value: v.value,
        rank: v.rank,
        display: v.value
      });
    }
  }
  // Add Jokers
  deck.push({
    id: `card_${idCounter++}`,
    suit: 'joker',
    value: 'black_joker',
    rank: 16,
    display: '小王'
  });
  deck.push({
    id: `card_${idCounter++}`,
    suit: 'joker',
    value: 'red_joker',
    rank: 17,
    display: '大王'
  });
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Check if a sequence of ranks is consecutive and none are > 14 (A)
function isConsecutive(ranks) {
  if (ranks.length === 0) return false;
  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i + 1] !== ranks[i] + 1) return false;
  }
  return ranks[ranks.length - 1] <= 14; // Must not include 2 (15) or Jokers
}

function parseHand(cards) {
  if (!cards || cards.length === 0) return null;

  const len = cards.length;
  // Sort cards by rank
  const sorted = [...cards].sort((a, b) => a.rank - b.rank);
  const ranks = sorted.map(c => c.rank);

  // Calculate frequencies
  const counts = {};
  for (const r of ranks) {
    counts[r] = (counts[r] || 0) + 1;
  }

  const freq = { 1: [], 2: [], 3: [], 4: [] };
  for (const r in counts) {
    const count = counts[r];
    const rankNum = parseInt(r);
    freq[count].push(rankNum);
  }

  // Sort freq keys
  for (const k in freq) {
    freq[k].sort((a, b) => a - b);
  }

  // 1. Single
  if (len === 1) {
    return { type: 'single', rank: ranks[0], cards: sorted };
  }

  // 2. Pair or Rocket
  if (len === 2) {
    if (ranks[0] === 16 && ranks[1] === 17) {
      return { type: 'rocket', rank: 17, cards: sorted };
    }
    if (freq[2].length === 1) {
      return { type: 'pair', rank: freq[2][0], cards: sorted };
    }
  }

  // 3. Triple
  if (len === 3) {
    if (freq[3].length === 1) {
      return { type: 'triple', rank: freq[3][0], cards: sorted };
    }
  }

  // 4. Triple + Single (3+1)
  if (len === 4) {
    if (freq[4].length === 1) {
      return { type: 'bomb', rank: freq[4][0], cards: sorted };
    }
    if (freq[3].length === 1 && freq[1].length === 1) {
      return { type: 'triple_one', rank: freq[3][0], cards: sorted };
    }
  }

  // 5. Triple + Pair (3+2)
  if (len === 5) {
    if (freq[3].length === 1 && freq[2].length === 1) {
      return { type: 'triple_pair', rank: freq[3][0], cards: sorted };
    }
    // Straight of length 5
    if (freq[1].length === 5 && isConsecutive(freq[1])) {
      return { type: 'straight', rank: freq[1][4], cards: sorted };
    }
  }

  // 6. Straights (length >= 5)
  if (len >= 5) {
    if (freq[1].length === len && isConsecutive(freq[1])) {
      return { type: 'straight', rank: freq[1][freq[1].length - 1], cards: sorted };
    }
  }

  // 7. Double straight (连对) - length >= 6 and even
  if (len >= 6 && len % 2 === 0) {
    const pairCount = len / 2;
    if (freq[2].length === pairCount && freq[1].length === 0 && freq[3].length === 0 && freq[4].length === 0 && isConsecutive(freq[2])) {
      return { type: 'double_straight', rank: freq[2][freq[2].length - 1], cards: sorted };
    }
  }

  // 8. Triple straight (飞机 / Plane without wings) - length >= 6 and multiple of 3
  if (len >= 6 && len % 3 === 0) {
    const tripCount = len / 3;
    if (freq[3].length === tripCount && freq[1].length === 0 && freq[2].length === 0 && freq[4].length === 0 && isConsecutive(freq[3])) {
      return { type: 'triple_straight', rank: freq[3][freq[3].length - 1], cards: sorted };
    }
  }

  // 9. Plane with wings (飞机带翅膀)
  // Can be R triples + R singles (e.g. 8 cards: 2 triples + 2 singles)
  // Or R triples + R pairs (e.g. 10 cards: 2 triples + 2 pairs)
  // Note: Quad can be split into triples or singles if needed, but standard logic checks consecutive triples.
  if (len >= 8) {
    const allTriples = [...freq[3], ...freq[4]].sort((a, b) => a - b);
    
    if (len % 4 === 0) {
      const R = len / 4;
      for (let i = 0; i <= allTriples.length - R; i++) {
        const sub = allTriples.slice(i, i + R);
        if (isConsecutive(sub)) {
          return { type: 'plane_wings', rank: sub[sub.length - 1], cards: sorted, wingType: 'single' };
        }
      }
    }
    if (len % 5 === 0) {
      const R = len / 5;
      for (let i = 0; i <= allTriples.length - R; i++) {
        const sub = allTriples.slice(i, i + R);
        if (isConsecutive(sub)) {
          const subSet = new Set(sub);
          const remainingRanks = ranks.filter(r => !subSet.has(r));
          const remCounts = {};
          for (const rr of remainingRanks) remCounts[rr] = (remCounts[rr] || 0) + 1;
          
          let isValidPairs = true;
          for (const rr in remCounts) {
            if (remCounts[rr] % 2 !== 0) {
              isValidPairs = false;
              break;
            }
          }
          if (isValidPairs) {
            return { type: 'plane_wings', rank: sub[sub.length - 1], cards: sorted, wingType: 'pair' };
          }
        }
      }
    }
  }

  // 10. Quad with two (四带二)
  // Quad + 2 singles (len = 6)
  // Quad + 2 pairs (len = 8)
  if (freq[4].length === 1) {
    const quadRank = freq[4][0];
    if (len === 6) {
      return { type: 'quad_two', rank: quadRank, cards: sorted, wingType: 'single' };
    }
    if (len === 8) {
      const remainingRanks = ranks.filter(r => r !== quadRank);
      const remCounts = {};
      for (const rr of remainingRanks) remCounts[rr] = (remCounts[rr] || 0) + 1;
      let pairCount = 0;
      for (const rr in remCounts) {
        if (remCounts[rr] === 2 || remCounts[rr] === 4) {
          pairCount += remCounts[rr] / 2;
        }
      }
      if (pairCount === 2) {
        return { type: 'quad_two', rank: quadRank, cards: sorted, wingType: 'pair' };
      }
    }
  }

  return null;
}

function compareHands(prev, curr) {
  const p = parseHand(prev);
  const c = parseHand(curr);

  if (!c) return false;
  if (!p) return true; // Free play

  if (c.type === 'rocket') return true;
  if (p.type === 'rocket') return false;

  if (c.type === 'bomb' && p.type !== 'bomb') return true;
  if (p.type === 'bomb' && c.type !== 'bomb') return false;

  if (c.type === 'bomb' && p.type === 'bomb') {
    return c.rank > p.rank;
  }

  if (c.type !== p.type || c.cards.length !== p.cards.length) {
    return false;
  }

  return c.rank > p.rank;
}

module.exports = {
  createDizhuDeck,
  shuffleDeck,
  parseHand,
  compareHands
};
