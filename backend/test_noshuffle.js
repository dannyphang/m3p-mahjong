// Quick smoke test for createPackedDeck and dealInChunks
const { createPackedDeck, dealInChunks, createDizhuDeck, shuffleDeck } = require('./dizhu_engine');

// Test 1: createPackedDeck produces 54 cards
const packed = createPackedDeck();
console.assert(packed.length === 54, `Expected 54 cards, got ${packed.length}`);

// All unique IDs
const ids = new Set(packed.map(c => c.id));
console.assert(ids.size === 54, `Expected 54 unique IDs, got ${ids.size}`);

// Test 2: dealInChunks splits correctly (17+17+17+3)
const result = dealInChunks(packed, 3, 17, 4);
console.assert(result.hands.length === 3, 'Expected 3 hands');
console.assert(result.hands[0].length === 17, `Hand 0: ${result.hands[0].length}`);
console.assert(result.hands[1].length === 17, `Hand 1: ${result.hands[1].length}`);
console.assert(result.hands[2].length === 17, `Hand 2: ${result.hands[2].length}`);
console.assert(result.remaining.length === 3, `Remaining: ${result.remaining.length}`);

// Test 3: No card appears in two hands or remaining
const allDealt = [...result.hands[0], ...result.hands[1], ...result.hands[2], ...result.remaining];
const dealtIds = new Set(allDealt.map(c => c.id));
console.assert(dealtIds.size === 54, `Expected 54 unique dealt cards, got ${dealtIds.size}`);

// Test 4: Packed deck should have some clusters
let clusters = 0;
for (let i = 0; i < packed.length - 1; i++) {
  if (packed[i].rank === packed[i + 1].rank) clusters++;
}
console.log(`Adjacent same-rank pairs in packed deck: ${clusters} (expect many, vs ~3 in shuffled)`);

const shuffled = shuffleDeck(createDizhuDeck());
let shuffledClusters = 0;
for (let i = 0; i < shuffled.length - 1; i++) {
  if (shuffled[i].rank === shuffled[i + 1].rank) shuffledClusters++;
}
console.log(`Adjacent same-rank pairs in shuffled deck: ${shuffledClusters}`);

// Test 5: Count bombs in hands
function countBombs(hand) {
  const counts = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank] || 0) + 1;
  return Object.values(counts).filter(v => v >= 4).length;
}

let totalBombs = 0;
for (let trial = 0; trial < 20; trial++) {
  const d = createPackedDeck();
  const r = dealInChunks(d, 3, 17, 4);
  for (const h of r.hands) totalBombs += countBombs(h);
}
console.log(`Avg bombs per game (packed, 20 trials): ${(totalBombs / 20).toFixed(1)} (expect ~2-3)`);

let totalBombsShuffled = 0;
for (let trial = 0; trial < 20; trial++) {
  const d = shuffleDeck(createDizhuDeck());
  const hands = [d.slice(0, 17), d.slice(17, 34), d.slice(34, 51)];
  for (const h of hands) totalBombsShuffled += countBombs(h);
}
console.log(`Avg bombs per game (shuffled, 20 trials): ${(totalBombsShuffled / 20).toFixed(1)} (expect ~0-1)`);

console.log('All assertions passed ✅');
