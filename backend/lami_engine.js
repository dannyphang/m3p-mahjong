// lami_engine.js
// Engine for M3P Lami Game Mode

const SUITS = ['red', 'blue', 'green', 'yellow']; // Hearts, Clubs, Spades, Diamonds
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function createLamiDeck() {
  const deck = [];
  // 2 sets of 1-13 in 4 suits
  for (let set = 0; set < 2; set++) {
    for (const suit of SUITS) {
      for (const num of NUMBERS) {
        deck.push({ type: 'number', suit, value: num, id: `${set}_${suit}_${num}` });
      }
    }
  }
  // 8 Jokers
  for (let i = 0; i < 8; i++) {
    deck.push({ type: 'joker', value: 'joker', id: `joker_${i}` });
  }
  return deck;
}

function shuffleLamiDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Validation logic assumes Jokers are handled dynamically.
// For now, these basic validators check for valid complete sets.
// Jokers act as wildcards.

function isExactValidSequence(cards) {
  if (cards.length > 13) return false;
  
  const nonJokerIdx = cards.findIndex(c => c.type !== 'joker');
  if (nonJokerIdx === -1) {
    cards.forEach(c => { c.representedValue = 'joker'; c.representedSuit = 'purple'; });
    return true; // all jokers
  }
  
  const suit = cards[nonJokerIdx].suit;
  const firstNonJokerVal = cards[nonJokerIdx].value;
  
  let expected = firstNonJokerVal - nonJokerIdx;
  if (expected < 1) return false;

  for (const c of cards) {
    if (c.type === 'joker') {
      if (expected > 14) return false;
      c.representedValue = expected === 14 ? 1 : expected;
      c.representedSuit = 'purple';
      expected++;
    } else {
      if (c.suit !== suit) return false;
      let val = c.value;
      if (val === 1 && expected === 14) val = 14;
      if (val !== expected) return false;
      if (val > 14) return false;
      expected = val + 1;
    }
  }
  return true;
}

function isValidStraightFlush(cards) {
  if (cards.length < 3) return false;
  if (cards.length > 13) return false;

  const jokersCount = cards.filter(c => c.type === 'joker').length;
  const originalNonJokers = cards.filter(c => c.type !== 'joker').map(c => ({...c}));
  if (originalNonJokers.length < 2) return true;

  const suit = originalNonJokers[0].suit;
  if (!originalNonJokers.every(c => c.suit === suit)) return false;

  const checkValidity = (nonJokersArray) => {
    const sorted = [...nonJokersArray].sort((a, b) => a.value - b.value);
    let gaps = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = sorted[i + 1].value - sorted[i].value;
      if (diff === 0) return false;
      gaps += (diff - 1);
    }
    return gaps <= jokersCount;
  };

  if (checkValidity(originalNonJokers)) return true;

  const hasA = originalNonJokers.some(c => c.value === 1);
  if (hasA) {
    const altNonJokers = originalNonJokers.map(c => ({...c, value: c.value === 1 ? 14 : c.value}));
    if (checkValidity(altNonJokers)) return true;
  }

  return false;
}

function orderStraightFlush(cards) {
  const jokersCount = cards.filter(c => c.type === 'joker').length;
  const originalNonJokers = cards.filter(c => c.type !== 'joker').map(c => ({...c}));
  
  let useA14 = false;
  const hasA = originalNonJokers.some(c => c.value === 1);
  
  if (hasA) {
    const checkValidity = (nonJokersArray) => {
      const sorted = [...nonJokersArray].sort((a, b) => a.value - b.value);
      let gaps = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const diff = sorted[i + 1].value - sorted[i].value;
        if (diff === 0) return false;
        gaps += (diff - 1);
      }
      return gaps <= jokersCount;
    };
    
    const validWith1 = checkValidity(originalNonJokers);
    const altNonJokers = originalNonJokers.map(c => ({...c, value: c.value === 1 ? 14 : c.value}));
    const validWith14 = checkValidity(altNonJokers);
    
    if (validWith14 && !validWith1) {
      useA14 = true;
    } else if (validWith14 && validWith1) {
      const hasHighCards = originalNonJokers.some(c => c.value >= 10 && c.value <= 13);
      if (hasHighCards) useA14 = true;
    }
  }

  const nonJokers = useA14 ? originalNonJokers.map(c => ({...c, value: c.value === 1 ? 14 : c.value})) : originalNonJokers;
  nonJokers.sort((a, b) => a.value - b.value);
  const jokers = cards.filter(c => c.type === 'joker');
  
  if (nonJokers.length === 0) return jokers;
  
  const ordered = [];
  let expectedValue = nonJokers[0].value;
  let nonJokerIdx = 0;
  
  ordered.push(nonJokers[0]);
  expectedValue++;
  nonJokerIdx++;
  
  while (nonJokerIdx < nonJokers.length) {
    if (nonJokers[nonJokerIdx].value === expectedValue) {
      ordered.push(nonJokers[nonJokerIdx]);
      nonJokerIdx++;
    } else {
      if (jokers.length > 0) {
        ordered.push(jokers.shift());
      }
    }
    expectedValue++;
  }
  
  while (jokers.length > 0) {
    if (expectedValue <= 14) {
      ordered.push(jokers.shift());
      expectedValue++;
    } else {
      ordered.unshift(jokers.shift());
    }
  }
  
  ordered.forEach(c => {
    if (c.value === 14) c.value = 1;
  });
  
  const firstNonJokerIdx = ordered.findIndex(c => c.type !== 'joker');
  if (firstNonJokerIdx !== -1) {
    const firstVal = ordered[firstNonJokerIdx].value;
    const suit = ordered[firstNonJokerIdx].suit;
    // We know ordered array is sequential in values.
    // Index firstNonJokerIdx has value firstVal. So index i has value: firstVal + (i - firstNonJokerIdx)
    ordered.forEach((c, i) => {
      if (c.type === 'joker') {
        let repVal = firstVal + (i - firstNonJokerIdx);
        // If repVal is outside 1-13, we might need to wrap it if it represents an Ace
        if (repVal === 14) repVal = 1;
        if (repVal < 1) repVal = 14 + repVal; // unlikely in Rummy but just in case
        c.representedValue = repVal;
        c.representedSuit = 'purple';
      }
    });
  } else {
    ordered.forEach(c => {
      c.representedValue = 'joker';
      c.representedSuit = 'purple';
    });
  }
  
  return ordered;
}

function orderSet(cards) {
  const nonJokers = cards.filter(c => c.type !== 'joker');
  const jokers = cards.filter(c => c.type === 'joker');
  
  const suitOrder = { red: 1, blue: 2, green: 3, yellow: 4 };
  nonJokers.sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit]);
  
  const val = nonJokers.length > 0 ? nonJokers[0].value : 'joker';
  jokers.forEach(j => {
    j.representedValue = val;
    j.representedSuit = 'purple';
  });
  
  return [...nonJokers, ...jokers];
}

function isValidSet(cards) {
  if (cards.length < 3) return false;
  const nonJokers = cards.filter(c => c.type !== 'joker');
  if (nonJokers.length === 0) return true;
  
  const value = nonJokers[0].value;
  if (nonJokers.some(c => c.value !== value)) return false;
  
  // In Lami/Rummikub, sets must be of DIFFERENT suits if they are the same number (in Rummikub up to 4 cards).
  // Or in traditional Lami, can they be same suit? The rules say "3张或以上数量点数相同的牌".
  // If no suit restriction is mentioned, we assume just same number.
  return true;
}

// Calculate the points of remaining hand
function calculateHandPoints(hand) {
  let points = 0;
  for (const card of hand) {
    if (card.type === 'joker') points += 20;
    else if (card.value === 1) points += 15;
    else if (card.value >= 11 && card.value <= 13) points += 10;
    else points += card.value;
  }
  return points;
}

// A/Joker Settlement calculation (returns the number of equivalent A/Joker pieces)
function calculateAJokerPieces(hand) {
  let pieces = 0;
  let aces = hand.filter(c => c.value === 1 && c.type !== 'joker');
  let jokers = hand.filter(c => c.type === 'joker');
  
  // Count jokers linearly
  pieces += jokers.length;

  // Aces logic
  // 2 identical aces = 4
  // 4 different aces = 10
  // "3 identical aces = 1 pair of identical aces (+4) + 1 single leftover ace (+1) = 5 aces"
  
  const aceCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
  aces.forEach(a => aceCounts[a.suit]++);

  // Process pairs of identical aces
  let singles = [];
  for (const suit of SUITS) {
    let count = aceCounts[suit];
    while (count >= 2) {
      pieces += 4;
      count -= 2;
    }
    if (count === 1) {
      singles.push(suit);
    }
  }

  // Process singles
  if (singles.length === 4) {
    pieces += 10; // 4 different aces
  } else {
    pieces += singles.length; // literal pieces
  }

  return pieces;
}

function hasAnyValidMove(hand, publicMelds, hasBrokenIce) {
  const sf = checkCombinations(hand, 3, isValidStraightFlush);
  if (!hasBrokenIce) {
    return sf;
  }

  if (sf) return true;
  if (checkCombinations(hand, 3, isValidSet)) return true;

  for (const t of hand) {
    for (const meld of publicMelds) {
      if (canConnectBruteForce(t, meld)) return true;
    }
  }

  return false;
}

function checkCombinations(arr, k, validator) {
  if (arr.length < k) return null;
  const comb = [];
  let result = null;
  function backtrack(start) {
    if (comb.length === k) {
      if (validator(comb)) {
        result = [...comb];
        return true;
      }
      return false;
    }
    for (let i = start; i < arr.length; i++) {
      comb.push(arr[i]);
      if (backtrack(i + 1)) return true;
      comb.pop();
    }
    return false;
  }
  backtrack(0);
  return result;
}

function canConnectBruteForce(tile, meld) {
  const copyStart = [tile, ...meld.tiles];
  if (meld.type === 'straight' && isExactValidSequence(copyStart)) return 'start';
  if (meld.type === 'set' && isValidSet(copyStart)) return 'start';

  const copyEnd = [...meld.tiles, tile];
  if (meld.type === 'straight' && isExactValidSequence(copyEnd)) return 'end';
  if (meld.type === 'set' && isValidSet(copyEnd)) return 'end';

  return null;
}

module.exports = {
  createLamiDeck,
  shuffleLamiDeck,
  isValidStraightFlush,
  isValidSet,
  orderStraightFlush,
  orderSet,
  calculateHandPoints,
  calculateAJokerPieces,
  hasAnyValidMove,
  isExactValidSequence,
  checkCombinations,
  canConnectBruteForce
};
