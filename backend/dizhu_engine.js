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

const RANK_TO_VALUE = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2'
};

function parseSubstitutedHand(cards) {
  if (!cards || cards.length === 0) return null;

  const len = cards.length;
  const sorted = [...cards].sort((a, b) => a.rank - b.rank);
  const ranks = sorted.map(c => c.rank);

  const counts = {};
  for (const r of ranks) {
    counts[r] = (counts[r] || 0) + 1;
  }

  const freq = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
  for (const r in counts) {
    const count = counts[r];
    const rankNum = parseInt(r);
    if (freq[count]) {
      freq[count].push(rankNum);
    }
  }

  for (const k in freq) {
    freq[k].sort((a, b) => a - b);
  }

  // Check if it is a bomb first (same-rank set of size >= 4)
  const uniqueRanks = Object.keys(counts);
  if (uniqueRanks.length === 1 && len >= 4) {
    const bombRank = parseInt(uniqueRanks[0]);
    const wildcardCount = sorted.filter(c => c.isWildcard).length;
    let bombType = 'soft_bomb';

    if (len === 4) {
      if (wildcardCount === 4) {
        bombType = 'laizi_bomb';
      } else if (wildcardCount === 0) {
        bombType = 'hard_bomb';
      } else {
        bombType = 'soft_bomb';
      }
    } else {
      bombType = 'mega_bomb';
    }

    return { type: 'bomb', bombType, rank: bombRank, cards: sorted };
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
    if (freq[3].length === 1 && freq[1].length === 1) {
      return { type: 'triple_one', rank: freq[3][0], cards: sorted };
    }
  }

  // 5. Triple + Pair (3+2)
  if (len === 5) {
    if (freq[3].length === 1 && freq[2].length === 1) {
      return { type: 'triple_pair', rank: freq[3][0], cards: sorted };
    }
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

  // 10. Quad with two (四带二) / Wangzha with two
  const parseWings = (wingCards) => {
    const wLen = wingCards.length;
    const wCounts = {};
    for (const c of wingCards) {
      wCounts[c.rank] = (wCounts[c.rank] || 0) + 1;
    }
    const values = Object.values(wCounts).sort((a, b) => b - a);

    if (wLen === 2) {
      return 'single';
    }
    if (wLen === 4) {
      if (values[0] === 4 || (values[0] === 2 && values[1] === 2)) {
        return 'pair';
      }
    }
    if (wLen === 6) {
      if (values[0] === 6 || (values[0] === 3 && values[1] === 3)) {
        return 'triple';
      }
    }
    if (wLen === 8) {
      if (values[0] === 8 || (values[0] === 4 && values[1] === 4)) {
        return 'quad';
      }
    }
    return null;
  };

  // A. Check Wangzha as primary
  const hasBlackJoker = ranks.includes(16);
  const hasRedJoker = ranks.includes(17);
  if (hasRedJoker && hasBlackJoker && len > 2) {
    const wingCards = sorted.filter(c => c.rank !== 16 && c.rank !== 17);
    const wingType = parseWings(wingCards);
    if (wingType) {
      return { type: 'quad_two', rank: 17, cards: sorted, wingType };
    }
  }

  // B. Check normal quad as primary
  if (freq[4].length >= 1) {
    for (const quadRank of freq[4]) {
      const wingCards = sorted.filter(c => c.rank !== quadRank);
      const wingType = parseWings(wingCards);
      if (wingType) {
        return { type: 'quad_two', rank: quadRank, cards: sorted, wingType };
      }
    }
  }

  return null;
}

function parseHandAll(cards, wildcardRank) {
  if (!cards || cards.length === 0) return [];

  const wildcards = [];
  const normalCards = [];
  for (const c of cards) {
    if (wildcardRank && c.rank === wildcardRank) {
      wildcards.push(c);
    } else {
      normalCards.push(c);
    }
  }

  if (wildcards.length === 0) {
    const res = parseSubstitutedHand(cards);
    return res ? [res] : [];
  }

  // Wildcards Played Alone
  if (cards.length === 1) {
    const res = parseSubstitutedHand(cards);
    return res ? [res] : [];
  }

  const results = [];
  const uniqueKeys = new Set();

  let ranksToTry = [];
  if (normalCards.length === 0) {
    ranksToTry = [wildcardRank];
  } else {
    const normalRanks = normalCards.map(c => c.rank);
    const minR = Math.max(3, Math.min(...normalRanks) - 4);
    const maxR = Math.min(15, Math.max(...normalRanks) + 4);
    for (let r = minR; r <= maxR; r++) {
      ranksToTry.push(r);
    }
  }

  function recurse(index, currentSubstituted) {
    if (index === wildcards.length) {
      const parsed = parseSubstitutedHand(currentSubstituted);
      if (parsed) {
        const key = `${parsed.type}_${parsed.bombType || ''}_${parsed.rank}_${parsed.wingType || ''}`;
        if (!uniqueKeys.has(key)) {
          uniqueKeys.add(key);
          results.push(parsed);
        }
      }
      return;
    }

    const card = wildcards[index];
    for (const r of ranksToTry) {
      const subCard = {
        ...card,
        rank: r,
        value: RANK_TO_VALUE[r],
        display: RANK_TO_VALUE[r],
        isWildcard: true
      };
      recurse(index + 1, [...currentSubstituted, subCard]);
    }
  }

  recurse(0, normalCards);
  return results;
}

function getBombPower(h) {
  if (!h) return -1;
  if (h.type === 'rocket') return 999;
  if (h.type === 'bomb') {
    if (h.bombType === 'soft_bomb') return 1;
    if (h.bombType === 'hard_bomb') return 2;
    if (h.bombType === 'laizi_bomb') return 3;
    if (h.bombType === 'mega_bomb') return 4;
  }
  return 0;
}

function beats(p, c) {
  const pPower = getBombPower(p);
  const cPower = getBombPower(c);

  if (c.type === 'rocket') {
    return p.type !== 'rocket';
  }

  if (cPower > 0 && pPower === 0) {
    return true;
  }

  if (cPower > 0 && pPower > 0 && p.type !== 'rocket') {
    if (cPower > pPower) {
      return true;
    }
    if (cPower < pPower) {
      return false;
    }
    if (c.bombType === 'mega_bomb') {
      if (c.cards.length > p.cards.length) return true;
      if (c.cards.length < p.cards.length) return false;
      return c.rank > p.rank;
    }
    return c.rank > p.rank;
  }

  if (c.type !== p.type || c.cards.length !== p.cards.length) {
    return false;
  }

  if (c.wingType !== p.wingType) {
    return false;
  }

  return c.rank > p.rank;
}

function parseHand(cards, wildcardRank) {
  const parsedList = parseHandAll(cards, wildcardRank);
  if (parsedList.length === 0) return null;
  parsedList.sort((a, b) => {
    const aPower = getBombPower(a);
    const bPower = getBombPower(b);
    if (aPower !== bPower) return bPower - aPower;
    return b.rank - a.rank;
  });
  return parsedList[0];
}

function compareHands(prev, curr, wildcardRank) {
  const currParsedList = parseHandAll(curr, wildcardRank);
  if (currParsedList.length === 0) return false;
  if (!prev) return true;

  let p;
  if (Array.isArray(prev)) {
    p = parseHand(prev, wildcardRank);
  } else if (prev && prev.cards) {
    p = prev;
  } else {
    return true;
  }

  if (!p) return false;

  for (const c of currParsedList) {
    if (beats(p, c)) {
      return true;
    }
  }

  return false;
}

// ponytail: Block order is randomized but internal block structure stays intact.
// Upgrade path: could weight block types by desired "excitement level".
function createPackedDeck() {
  const deck = [];
  let idCounter = 0;

  // Build all 52 regular cards grouped by rank
  const byRank = {};
  for (const suit of SUITS) {
    for (const v of VALUES) {
      const card = {
        id: `card_${idCounter++}`,
        suit,
        value: v.value,
        rank: v.rank,
        display: v.value
      };
      if (!byRank[v.rank]) byRank[v.rank] = [];
      byRank[v.rank].push(card);
    }
  }

  const jokerBlack = { id: `card_${idCounter++}`, suit: 'joker', value: 'black_joker', rank: 16, display: '小王' };
  const jokerRed = { id: `card_${idCounter++}`, suit: 'joker', value: 'red_joker', rank: 17, display: '大王' };

  // Build structured blocks from the ranked groups
  const blocks = [];
  const usedRanks = new Set();

  // 1. Keep 2-3 full bombs (4-of-a-kind) intact
  const rankKeys = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const bombCount = 2 + Math.floor(Math.random() * 2); // 2 or 3 bombs
  const shuffledRanks = [...rankKeys].sort(() => Math.random() - 0.5);
  let bombsMade = 0;
  for (const r of shuffledRanks) {
    if (bombsMade >= bombCount) break;
    if (byRank[r].length === 4 && r <= 14) { // Don't lock 2s (rank 15) as bombs too often
      blocks.push([...byRank[r]]);
      usedRanks.add(r);
      bombsMade++;
    }
  }

  // 2. Build 1-2 straights from remaining cards
  const straightCount = 1 + Math.floor(Math.random() * 2);
  for (let s = 0; s < straightCount; s++) {
    // Find a consecutive run of 5+ ranks with available cards
    const available = rankKeys.filter(r => !usedRanks.has(r) && r <= 14);
    if (available.length < 5) break;

    // Pick a random starting point
    const maxStart = available.length - 5;
    const startIdx = Math.floor(Math.random() * (maxStart + 1));
    const len = 5 + Math.floor(Math.random() * Math.min(4, available.length - startIdx - 5 + 1));
    const straightRanks = [];

    for (let i = startIdx; i < startIdx + len && i < available.length; i++) {
      // Check consecutive
      if (straightRanks.length > 0 && available[i] !== available[i - 1] + 1) break;
      straightRanks.push(available[i]);
    }

    if (straightRanks.length >= 5) {
      const straight = [];
      for (const r of straightRanks) {
        // Take one card of each rank for the straight
        const card = byRank[r].pop();
        if (card) straight.push(card);
        if (byRank[r].length === 0) usedRanks.add(r);
      }
      blocks.push(straight);
    }
  }

  // 3. Group remaining cards into pairs/triples (keep same-rank cards together)
  for (const r of rankKeys) {
    if (usedRanks.has(r)) continue;
    const remaining = byRank[r];
    if (remaining.length > 0) {
      blocks.push([...remaining]);
      usedRanks.add(r);
    }
  }

  // 4. Add jokers as a pair
  blocks.push([jokerBlack, jokerRed]);

  // Shuffle block order (not card order within blocks)
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }

  // Flatten
  for (const block of blocks) {
    deck.push(...block);
  }

  return deck;
}

function dealInChunks(deck, numPlayers, handSize, chunkSize) {
  const hands = Array.from({ length: numPlayers }, () => []);
  let pos = 0;
  const totalCards = numPlayers * handSize;

  while (pos < totalCards && pos < deck.length) {
    for (let p = 0; p < numPlayers && pos < totalCards; p++) {
      const end = Math.min(pos + chunkSize, totalCards - hands.reduce((s, h, i) => i !== p ? s + (handSize - h.length) : s, 0));
      const take = Math.min(chunkSize, handSize - hands[p].length, deck.length - pos);
      for (let c = 0; c < take; c++) {
        hands[p].push(deck[pos++]);
      }
    }
  }

  return { hands, remaining: deck.slice(pos) };
}

module.exports = {
  createDizhuDeck,
  shuffleDeck,
  parseHand,
  compareHands,
  parseHandAll,
  createPackedDeck,
  dealInChunks
};

