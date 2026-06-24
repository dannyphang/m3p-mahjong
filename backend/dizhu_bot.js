// backend/dizhu_bot.js
// Bot AI logic for Dou Dizhu (斗地主)

const { parseHand, compareHands } = require('./dizhu_engine');

function executeDizhuBotTurn(state, io) {
  if (state.status === 'BIDDING') {
    handleBotBid(state, io);
  } else if (state.status === 'PLAYING') {
    handleBotPlay(state, io);
  }
}

function handleBotBid(state, io) {
  const botId = state.players[state.currentTurn].id;
  const hand = state.hands[botId] || [];

  // Count high cards (rank >= 15: 2, Black Joker, Red Joker)
  const highCardsCount = hand.filter(c => c.rank >= 15).length;
  
  let targetBid = 0;
  if (highCardsCount >= 3) targetBid = 3;
  else if (highCardsCount === 2) targetBid = 2;
  else if (highCardsCount === 1) targetBid = 1;

  // Must bid higher than current highest bid, or pass
  if (targetBid <= state.highestBid) {
    targetBid = 0; // Pass
  }

  state.bid(botId, targetBid, io);
}

function handleBotPlay(state, io) {
  const botId = state.players[state.currentTurn].id;
  const hand = [...(state.hands[botId] || [])].sort((a, b) => a.rank - b.rank);

  // If free play, start a new combination
  if (!state.lastPlayedHand) {
    const play = selectInitialPlay(hand);
    state.playCards(botId, play, io);
    return;
  }

  // Follow the hand
  const followPlay = findFollowPlay(hand, state.lastPlayedHand.cards);
  if (followPlay && followPlay.length > 0) {
    state.playCards(botId, followPlay, io);
  } else {
    state.pass(botId, io);
  }
}

// Find a simple starting play (free play)
function selectInitialPlay(hand) {
  // Let's group hand by rank frequencies
  const counts = groupByRank(hand);

  // 1. Try to find the smallest pair
  const pairs = Object.keys(counts).filter(r => counts[r].length === 2).map(Number).sort((a, b) => a - b);
  if (pairs.length > 0) {
    return counts[pairs[0]];
  }

  // 2. Otherwise play the smallest single
  return [hand[0]];
}

// Find a play that beats the target cards
function findFollowPlay(hand, targetCards) {
  const parsed = parseHand(targetCards);
  if (!parsed) return null;

  const counts = groupByRank(hand);

  // Helper to find a matching rank combination
  if (parsed.type === 'single') {
    // Find any card with rank > parsed.rank
    const candidates = hand.filter(c => c.rank > parsed.rank);
    if (candidates.length > 0) {
      // Pick the smallest rank candidate
      return [candidates[0]];
    }
  } else if (parsed.type === 'pair') {
    // Find any pair with rank > parsed.rank
    const pairs = Object.keys(counts).filter(r => counts[r].length >= 2 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (pairs.length > 0) {
      return counts[pairs[0]].slice(0, 2);
    }
  } else if (parsed.type === 'triple') {
    const triples = Object.keys(counts).filter(r => counts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      return counts[triples[0]].slice(0, 3);
    }
  } else if (parsed.type === 'triple_one') {
    const triples = Object.keys(counts).filter(r => counts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      const tripCards = counts[triples[0]].slice(0, 3);
      // Find one single that is not part of the triple
      const wingCandidate = hand.find(c => c.rank !== triples[0]);
      if (wingCandidate) {
        return [...tripCards, wingCandidate];
      }
    }
  } else if (parsed.type === 'triple_pair') {
    const triples = Object.keys(counts).filter(r => counts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      const tripCards = counts[triples[0]].slice(0, 3);
      // Find one pair that is not part of the triple
      const pairKey = Object.keys(counts).find(r => Number(r) !== triples[0] && counts[r].length >= 2);
      if (pairKey) {
        return [...tripCards, ...counts[pairKey].slice(0, 2)];
      }
    }
  }

  // If no normal beats, try a bomb
  const bombs = Object.keys(counts).filter(r => counts[r].length === 4).map(Number).sort((a, b) => a - b);
  if (parsed.type !== 'bomb' && parsed.type !== 'rocket') {
    if (bombs.length > 0) {
      return counts[bombs[0]];
    }
  } else if (parsed.type === 'bomb') {
    // Must beat the bomb rank
    const higherBombs = bombs.filter(r => r > parsed.rank);
    if (higherBombs.length > 0) {
      return counts[higherBombs[0]];
    }
  }

  // Try Rocket (Black Joker + Red Joker)
  const bj = hand.find(c => c.rank === 16);
  const rj = hand.find(c => c.rank === 17);
  if (bj && rj && parsed.type !== 'rocket') {
    return [bj, rj];
  }

  return null;
}

function groupByRank(hand) {
  const counts = {};
  for (const c of hand) {
    if (!counts[c.rank]) counts[c.rank] = [];
    counts[c.rank].push(c);
  }
  return counts;
}

module.exports = {
  executeDizhuBotTurn
};
