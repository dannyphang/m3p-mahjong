// backend/dizhu_bot.js
// Bot AI logic for Dou Dizhu (斗地主)

const { parseHand, compareHands } = require('./dizhu_engine');

function executeDizhuBotTurn(state, io) {
  const botPlayer = state.players[state.currentTurn];
  const difficulty = botPlayer.difficulty || 'normal';

  if (state.status === 'BIDDING') {
    handleBotBid(state, io, difficulty);
  } else if (state.status === 'PLAYING') {
    handleBotPlay(state, io, difficulty);
  }
}

function handleBotBid(state, io, difficulty) {
  const botId = state.players[state.currentTurn].id;
  const hand = state.hands[botId] || [];

  // Count high cards (rank >= 15: 2, Black Joker, Red Joker)
  const highCardsCount = hand.filter(c => c.rank >= 15).length;
  
  // Count bombs
  const counts = groupByRank(hand);
  const bombsCount = Object.keys(counts).filter(r => counts[r].length === 4).length;

  // Count 5-card straights
  let straightsCount = 0;
  for (let R = 3; R <= 10; R++) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (!counts[R + i] || counts[R + i].length === 0) {
        ok = false;
        break;
      }
    }
    if (ok) {
      straightsCount++;
      R += 4; // Skip to avoid overlapping
    }
  }

  let score = highCardsCount + bombsCount + straightsCount;
  if (difficulty === 'hard') {
    score += 1; // Bid more aggressively
  }

  let targetBid = 0;
  if (score >= 3) targetBid = 3;
  else if (score === 2) targetBid = 2;
  else if (score === 1) targetBid = 1;

  // Must bid higher than current highest bid, or pass
  if (targetBid <= state.highestBid) {
    targetBid = 0; // Pass
  }

  state.bid(botId, targetBid, io);
}

function handleBotPlay(state, io, difficulty) {
  const botId = state.players[state.currentTurn].id;
  const hand = [...(state.hands[botId] || [])].sort((a, b) => a.rank - b.rank);

  // If free play, start a new combination
  if (!state.lastPlayedHand) {
    const play = selectInitialPlay(hand, difficulty);
    const success = state.playCards(botId, play, io);
    if (!success) {
      // ponytail: Fallback to lowest single if AI generates an illegal initial play
      state.playCards(botId, [hand[0]], io);
    }
    return;
  }

  // Follow the hand
  const followPlay = findFollowPlay(hand, state.lastPlayedHand, difficulty, state);
  if (followPlay && followPlay.length > 0) {
    const success = state.playCards(botId, followPlay, io);
    if (!success) {
      // ponytail: Fallback to pass if AI generates an illegal follow play
      state.pass(botId, io);
    }
  } else {
    state.pass(botId, io);
  }
}

// Group hand by rank frequencies
function groupByRank(hand) {
  const counts = {};
  for (const c of hand) {
    if (!counts[c.rank]) counts[c.rank] = [];
    counts[c.rank].push(c);
  }
  return counts;
}

// Get cards that are NOT part of any bomb or rocket in the hand
function getAvailableCards(hand) {
  const counts = groupByRank(hand);
  const bombRanks = Object.keys(counts).filter(r => counts[r].length === 4).map(Number);
  const hasRocket = hand.some(c => c.rank === 16) && hand.some(c => c.rank === 17);

  return hand.filter(c => {
    if (hasRocket && (c.rank === 16 || c.rank === 17)) return false;
    if (bombRanks.includes(c.rank)) return false;
    return true;
  });
}

// Find a starting play (free play)
function selectInitialPlay(hand, difficulty) {
  const counts = groupByRank(hand);

  // Easy mode: current behavior (pairs then singles)
  if (difficulty === 'easy') {
    const pairs = Object.keys(counts).filter(r => counts[r].length === 2).map(Number).sort((a, b) => a - b);
    if (pairs.length > 0) {
      return counts[pairs[0]];
    }
    return [hand[0]];
  }

  // normal / hard: full combo play
  const availableCards = getAvailableCards(hand);
  const availCounts = groupByRank(availableCards);

  // 1. Rocket
  const hasRocket = hand.some(c => c.rank === 16) && hand.some(c => c.rank === 17);
  if (hasRocket && hand.length === 2) {
    return hand.filter(c => c.rank === 16 || c.rank === 17);
  }

  // 2. Bomb
  const bombRanks = Object.keys(counts).filter(r => counts[r].length === 4).map(Number).sort((a, b) => a - b);
  if (bombRanks.length > 0 && availableCards.length === 0) {
    return counts[bombRanks[0]];
  }

  // 3. Straight (length >= 5)
  for (let R = 3; R <= 10; R++) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (!availCounts[R + i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const play = [];
      for (let i = 0; i < 5; i++) {
        play.push(availCounts[R + i][0]);
      }
      return play;
    }
  }

  // 4. Double straight (length >= 3 consecutive pairs)
  for (let R = 3; R <= 12; R++) {
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (!availCounts[R + i] || availCounts[R + i].length < 2) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const play = [];
      for (let i = 0; i < 3; i++) {
        play.push(...availCounts[R + i].slice(0, 2));
      }
      return play;
    }
  }

  // 5. Triple straight (length >= 2 consecutive triples)
  for (let R = 3; R <= 13; R++) {
    let ok = true;
    for (let i = 0; i < 2; i++) {
      if (!availCounts[R + i] || availCounts[R + i].length < 3) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const play = [];
      for (let i = 0; i < 2; i++) {
        play.push(...availCounts[R + i].slice(0, 3));
      }
      return play;
    }
  }

  // 6. Plane wings (length >= 2 consecutive triples + singles/pairs)
  for (let R = 3; R <= 13; R++) {
    let ok = true;
    for (let i = 0; i < 2; i++) {
      if (!availCounts[R + i] || availCounts[R + i].length < 3) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const tripCards = [];
      for (let i = 0; i < 2; i++) {
        tripCards.push(...availCounts[R + i].slice(0, 3));
      }
      // Try to find 2 pairs
      const otherPairs = [];
      for (const r in availCounts) {
        const rNum = Number(r);
        if (rNum !== R && rNum !== R + 1 && availCounts[rNum].length >= 2) {
          otherPairs.push(availCounts[rNum].slice(0, 2));
        }
      }
      if (otherPairs.length >= 2) {
        otherPairs.sort((a, b) => a[0].rank - b[0].rank);
        return [...tripCards, ...otherPairs[0], ...otherPairs[1]];
      }
      // Try to find 2 singles
      const otherCards = availableCards.filter(c => c.rank !== R && c.rank !== R + 1);
      if (otherCards.length >= 2) {
        otherCards.sort((a, b) => a.rank - b.rank);
        return [...tripCards, otherCards[0], otherCards[1]];
      }
    }
  }

  // 7. Triple + Pair
  for (let T = 3; T <= 15; T++) {
    if (availCounts[T] && availCounts[T].length >= 3) {
      const tripCards = availCounts[T].slice(0, 3);
      const pairs = [];
      for (const r in availCounts) {
        const rNum = Number(r);
        if (rNum !== T && availCounts[rNum].length >= 2) {
          pairs.push(availCounts[rNum].slice(0, 2));
        }
      }
      if (pairs.length > 0) {
        pairs.sort((a, b) => a[0].rank - b[0].rank);
        return [...tripCards, ...pairs[0]];
      }
    }
  }

  // 8. Triple + Single
  for (let T = 3; T <= 15; T++) {
    if (availCounts[T] && availCounts[T].length >= 3) {
      const tripCards = availCounts[T].slice(0, 3);
      const singles = availableCards.filter(c => c.rank !== T);
      if (singles.length > 0) {
        singles.sort((a, b) => a.rank - b.rank);
        return [...tripCards, singles[0]];
      }
    }
  }

  // 9. Triple
  for (let T = 3; T <= 15; T++) {
    if (availCounts[T] && availCounts[T].length >= 3) {
      return availCounts[T].slice(0, 3);
    }
  }

  // 10. Pair
  for (let P = 3; P <= 15; P++) {
    if (availCounts[P] && availCounts[P].length >= 2) {
      return availCounts[P].slice(0, 2);
    }
  }

  // 11. Single
  if (availableCards.length > 0) {
    return [availableCards[0]];
  }

  // Fallback to bombs / rocket if nothing else is left
  if (bombRanks.length > 0) {
    return counts[bombRanks[0]];
  }
  if (hasRocket) {
    return hand.filter(c => c.rank === 16 || c.rank === 17);
  }

  return [hand[0]];
}

// Check if bot is allowed to strategically bomb
function canBomb(state, difficulty) {
  if (difficulty === 'easy' || difficulty === 'hard') {
    return true;
  }

  // normal difficulty: only bomb if an opponent has <= 5 cards or bot has <= 3 cards
  const botId = state.players[state.currentTurn].id;
  const botHandCount = state.hands[botId]?.length || 0;
  
  let minOpponentCards = 99;
  for (const p of state.players) {
    if (p.id !== botId) {
      const count = state.hands[p.id]?.length || 0;
      if (count < minOpponentCards) {
        minOpponentCards = count;
      }
    }
  }

  return minOpponentCards <= 5 || botHandCount <= 3;
}

// Find a play that beats the target cards
function findFollowPlay(hand, targetHand, difficulty, state) {
  const wildcardRank = state ? state.wildcardRank : null;
  if (wildcardRank !== null && wildcardRank !== undefined) {
    return findFollowPlayLaizi(hand, targetHand, difficulty, state, wildcardRank);
  }

  const parsed = (targetHand && targetHand.type) ? targetHand : parseHand(targetHand);
  if (!parsed) return null;
  const targetCards = targetHand?.cards || targetHand;

  const counts = groupByRank(hand);
  const availableCards = getAvailableCards(hand);
  const availCounts = groupByRank(availableCards);

  // Helper to check if a specific play is returned
  let playCandidate = null;

  if (parsed.type === 'single') {
    const candidates = availableCards.filter(c => c.rank > parsed.rank);
    if (candidates.length > 0) {
      playCandidate = [candidates[0]];
    }
  } else if (parsed.type === 'pair') {
    const pairs = Object.keys(availCounts).filter(r => availCounts[r].length >= 2 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (pairs.length > 0) {
      playCandidate = availCounts[pairs[0]].slice(0, 2);
    }
  } else if (parsed.type === 'triple') {
    const triples = Object.keys(availCounts).filter(r => availCounts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      playCandidate = availCounts[triples[0]].slice(0, 3);
    }
  } else if (parsed.type === 'triple_one') {
    const triples = Object.keys(availCounts).filter(r => availCounts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      const tripCards = availCounts[triples[0]].slice(0, 3);
      const wingCandidate = availableCards.find(c => c.rank !== triples[0]);
      if (wingCandidate) {
        playCandidate = [...tripCards, wingCandidate];
      }
    }
  } else if (parsed.type === 'triple_pair') {
    const triples = Object.keys(availCounts).filter(r => availCounts[r].length >= 3 && Number(r) > parsed.rank).map(Number).sort((a, b) => a - b);
    if (triples.length > 0) {
      const tripCards = availCounts[triples[0]].slice(0, 3);
      const pairKey = Object.keys(availCounts).find(r => Number(r) !== triples[0] && availCounts[r].length >= 2);
      if (pairKey) {
        playCandidate = [...tripCards, ...availCounts[pairKey].slice(0, 2)];
      }
    }
  } else if (parsed.type === 'straight') {
    const L = targetCards.length;
    // Find a straight of the same length with a higher max rank
    for (let S = 3; S <= 14 - L + 1; S++) {
      if (S + L - 1 > parsed.rank) {
        let ok = true;
        for (let i = 0; i < L; i++) {
          if (!availCounts[S + i]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const play = [];
          for (let i = 0; i < L; i++) {
            play.push(availCounts[S + i][0]);
          }
          playCandidate = play;
          break;
        }
      }
    }
  } else if (parsed.type === 'double_straight') {
    const L = targetCards.length;
    const P = L / 2; // Number of pairs
    for (let S = 3; S <= 14 - P + 1; S++) {
      if (S + P - 1 > parsed.rank) {
        let ok = true;
        for (let i = 0; i < P; i++) {
          if (!availCounts[S + i] || availCounts[S + i].length < 2) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const play = [];
          for (let i = 0; i < P; i++) {
            play.push(...availCounts[S + i].slice(0, 2));
          }
          playCandidate = play;
          break;
        }
      }
    }
  } else if (parsed.type === 'triple_straight') {
    const L = targetCards.length;
    const T = L / 3; // Number of triples
    for (let S = 3; S <= 14 - T + 1; S++) {
      if (S + T - 1 > parsed.rank) {
        let ok = true;
        for (let i = 0; i < T; i++) {
          if (!availCounts[S + i] || availCounts[S + i].length < 3) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const play = [];
          for (let i = 0; i < T; i++) {
            play.push(...availCounts[S + i].slice(0, 3));
          }
          playCandidate = play;
          break;
        }
      }
    }
  } else if (parsed.type === 'plane_wings') {
    const T = parsed.wingType === 'single' ? targetCards.length / 4 : targetCards.length / 5;
    for (let S = 3; S <= 14 - T + 1; S++) {
      if (S + T - 1 > parsed.rank) {
        let ok = true;
        for (let i = 0; i < T; i++) {
          if (!availCounts[S + i] || availCounts[S + i].length < 3) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const tripCards = [];
          for (let i = 0; i < T; i++) {
            tripCards.push(...availCounts[S + i].slice(0, 3));
          }
          // Find wings
          const tripleRanks = new Set();
          for (let i = 0; i < T; i++) tripleRanks.add(S + i);

          if (parsed.wingType === 'single') {
            const otherCards = availableCards.filter(c => !tripleRanks.has(c.rank));
            if (otherCards.length >= T) {
              otherCards.sort((a, b) => a.rank - b.rank);
              playCandidate = [...tripCards, ...otherCards.slice(0, T)];
              break;
            }
          } else {
            const otherPairs = [];
            for (const r in availCounts) {
              const rNum = Number(r);
              if (!tripleRanks.has(rNum) && availCounts[rNum].length >= 2) {
                otherPairs.push(availCounts[rNum].slice(0, 2));
              }
            }
            if (otherPairs.length >= T) {
              otherPairs.sort((a, b) => a[0].rank - b[0].rank);
              const wings = [];
              for (let i = 0; i < T; i++) {
                wings.push(...otherPairs[i]);
              }
              playCandidate = [...tripCards, ...wings];
              break;
            }
          }
        }
      }
    }
  } else if (parsed.type === 'quad_two') {
    // Find higher quad (either normal quad or wangzha)
    const targetRank = parsed.rank;
    const bombRanks = Object.keys(counts).filter(r => counts[r].length === 4).map(Number).sort((a, b) => a - b);
    
    // Ranks of candidate primary quads
    const candidates = [];
    for (const r of bombRanks) {
      if (r > targetRank) candidates.push({ rank: r, cards: counts[r] });
    }
    // Check if we have wangzha and its rank (17) is higher than targetRank
    const hasRocket = hand.some(c => c.rank === 16) && hand.some(c => c.rank === 17);
    if (hasRocket && 17 > targetRank) {
      candidates.push({ rank: 17, cards: hand.filter(c => c.rank === 16 || c.rank === 17) });
    }

    // Try candidates in ascending rank order
    candidates.sort((a, b) => a.rank - b.rank);

    for (const cand of candidates) {
      const quadCards = cand.cards;
      const qRank = cand.rank;

      // Filter remaining cards to find wings
      const remCards = qRank === 17 
        ? hand.filter(c => c.rank !== 16 && c.rank !== 17)
        : availableCards.filter(c => c.rank !== qRank);
      const remCounts = groupByRank(remCards);

      if (parsed.wingType === 'single') {
        if (remCards.length >= 2) {
          remCards.sort((a, b) => a.rank - b.rank);
          playCandidate = [...quadCards, ...remCards.slice(0, 2)];
          break;
        }
      } else if (parsed.wingType === 'pair') {
        const pairs = [];
        for (const r in remCounts) {
          if (remCounts[r].length >= 2) pairs.push(remCounts[r].slice(0, 2));
        }
        if (pairs.length >= 2) {
          pairs.sort((a, b) => a[0].rank - b[0].rank);
          playCandidate = [...quadCards, ...pairs[0], ...pairs[1]];
          break;
        }
      } else if (parsed.wingType === 'triple') {
        const triples = [];
        for (const r in remCounts) {
          if (remCounts[r].length >= 3) triples.push(remCounts[r].slice(0, 3));
        }
        if (triples.length >= 2) {
          triples.sort((a, b) => a[0].rank - b[0].rank);
          playCandidate = [...quadCards, ...triples[0], ...triples[1]];
          break;
        }
      } else if (parsed.wingType === 'quad') {
        const quads = [];
        for (const r in remCounts) {
          if (remCounts[r].length >= 4) quads.push(remCounts[r].slice(0, 4));
        }
        if (quads.length >= 2) {
          quads.sort((a, b) => a[0].rank - b[0].rank);
          playCandidate = [...quadCards, ...quads[0], ...quads[1]];
          break;
        }
      }
    }
  }

  if (playCandidate) {
    return playCandidate;
  }

  // If target hand is already a bomb/rocket, or if bot is strategically allowed to bomb
  const targetIsBombOrRocket = parsed.type === 'bomb' || parsed.type === 'rocket';
  if (targetIsBombOrRocket || canBomb(state, difficulty)) {
    // Find bomb
    const bombs = Object.keys(counts).filter(r => counts[r].length === 4).map(Number).sort((a, b) => a - b);
    if (parsed.type !== 'bomb' && parsed.type !== 'rocket') {
      if (bombs.length > 0) {
        return counts[bombs[0]];
      }
    } else if (parsed.type === 'bomb') {
      const higherBombs = bombs.filter(r => r > parsed.rank);
      if (higherBombs.length > 0) {
        return counts[higherBombs[0]];
      }
    }

    if (bj && rj && parsed.type !== 'rocket') {
      return [bj, rj];
    }
  }

  return null;
}

function findFollowPlayLaizi(hand, targetHand, difficulty, state, wildcardRank) {
  const parsed = (targetHand && targetHand.type) ? targetHand : parseHand(targetHand, wildcardRank);
  if (!parsed) return null;
  const targetCards = targetHand?.cards || targetHand;

  const normalCards = hand.filter(c => c.rank !== wildcardRank);
  const wildcards = hand.filter(c => c.rank === wildcardRank);
  const counts = groupByRank(hand);
  const normalCounts = groupByRank(normalCards);

  function findSameRankSet(P, neededSize, availableWildcards, excludedRanks = new Set()) {
    if (excludedRanks.has(P)) return null;
    const native = normalCounts[P] || [];
    const neededWildcards = neededSize - native.length;
    // ponytail: A combination made entirely of wildcards acts as its natural rank.
    if (native.length === 0 && neededWildcards > 0 && P !== wildcardRank) {
      return null;
    }
    if (neededWildcards >= 0 && neededWildcards <= availableWildcards.length) {
      return [...native, ...availableWildcards.slice(0, neededWildcards)];
    }
    return null;
  }

  let playCandidate = null;

  if (parsed.type === 'single') {
    const candidates = hand.filter(c => c.rank > parsed.rank);
    if (candidates.length > 0) {
      const normalCands = candidates.filter(c => c.rank !== wildcardRank);
      if (normalCands.length > 0) {
        playCandidate = [normalCands[0]];
      } else {
        playCandidate = [candidates[0]];
      }
    }
  } else if (parsed.type === 'pair') {
    for (let P = parsed.rank + 1; P <= 15; P++) {
      const set = findSameRankSet(P, 2, wildcards);
      if (set) {
        playCandidate = set;
        break;
      }
    }
  } else if (parsed.type === 'triple') {
    for (let P = parsed.rank + 1; P <= 15; P++) {
      const set = findSameRankSet(P, 3, wildcards);
      if (set) {
        playCandidate = set;
        break;
      }
    }
  } else if (parsed.type === 'triple_one') {
    for (let P = parsed.rank + 1; P <= 15; P++) {
      const set = findSameRankSet(P, 3, wildcards);
      if (set) {
        const usedWildcards = set.filter(c => c.rank === wildcardRank).length;
        const remWildcards = wildcards.slice(usedWildcards);
        const remNormal = normalCards.filter(c => c.rank !== P);
        const remAll = [...remNormal, ...remWildcards];
        if (remAll.length >= 1) {
          remAll.sort((a, b) => a.rank - b.rank);
          playCandidate = [...set, remAll[0]];
          break;
        }
      }
    }
  } else if (parsed.type === 'triple_pair') {
    for (let P = parsed.rank + 1; P <= 15; P++) {
      const set = findSameRankSet(P, 3, wildcards);
      if (set) {
        const usedWildcards = set.filter(c => c.rank === wildcardRank).length;
        const remWildcards = wildcards.slice(usedWildcards);
        let foundPair = null;
        for (let Q = 3; Q <= 15; Q++) {
          if (Q === P) continue;
          const pairSet = findSameRankSet(Q, 2, remWildcards);
          if (pairSet) {
            foundPair = pairSet;
            break;
          }
        }
        if (foundPair) {
          playCandidate = [...set, ...foundPair];
          break;
        }
      }
    }
  } else if (parsed.type === 'straight') {
    const L = targetCards.length;
    for (let S = 3; S <= 14 - L + 1; S++) {
      if (S + L - 1 > parsed.rank) {
        let straightCards = [];
        let usedWildcards = 0;
        let ok = true;
        for (let i = 0; i < L; i++) {
          const r = S + i;
          if (normalCounts[r] && normalCounts[r].length > 0) {
            straightCards.push(normalCounts[r][0]);
          } else {
            if (usedWildcards < wildcards.length) {
              straightCards.push(wildcards[usedWildcards]);
              usedWildcards++;
            } else {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          playCandidate = straightCards;
          break;
        }
      }
    }
  } else if (parsed.type === 'double_straight') {
    const L = targetCards.length;
    const P_count = L / 2;
    for (let S = 3; S <= 14 - P_count + 1; S++) {
      if (S + P_count - 1 > parsed.rank) {
        let straightCards = [];
        let usedWildcards = 0;
        let ok = true;
        for (let i = 0; i < P_count; i++) {
          const r = S + i;
          const native = normalCounts[r] || [];
          const needed = 2 - native.length;
          if (needed > 0) {
            if (usedWildcards + needed <= wildcards.length) {
              straightCards.push(...native, ...wildcards.slice(usedWildcards, usedWildcards + needed));
              usedWildcards += needed;
            } else {
              ok = false;
              break;
            }
          } else {
            straightCards.push(...native.slice(0, 2));
          }
        }
        if (ok) {
          playCandidate = straightCards;
          break;
        }
      }
    }
  } else if (parsed.type === 'triple_straight') {
    const L = targetCards.length;
    const T = L / 3;
    for (let S = 3; S <= 14 - T + 1; S++) {
      if (S + T - 1 > parsed.rank) {
        let straightCards = [];
        let usedWildcards = 0;
        let ok = true;
        for (let i = 0; i < T; i++) {
          const r = S + i;
          const native = normalCounts[r] || [];
          const needed = 3 - native.length;
          if (needed > 0) {
            if (usedWildcards + needed <= wildcards.length) {
              straightCards.push(...native, ...wildcards.slice(usedWildcards, usedWildcards + needed));
              usedWildcards += needed;
            } else {
              ok = false;
              break;
            }
          } else {
            straightCards.push(...native.slice(0, 3));
          }
        }
        if (ok) {
          playCandidate = straightCards;
          break;
        }
      }
    }
  } else if (parsed.type === 'plane_wings') {
    const T = parsed.wingType === 'single' ? targetCards.length / 4 : targetCards.length / 5;
    for (let S = 3; S <= 14 - T + 1; S++) {
      if (S + T - 1 > parsed.rank) {
        let straightCards = [];
        let usedWildcards = 0;
        let ok = true;
        for (let i = 0; i < T; i++) {
          const r = S + i;
          const native = normalCounts[r] || [];
          const needed = 3 - native.length;
          if (needed > 0) {
            if (usedWildcards + needed <= wildcards.length) {
              straightCards.push(...native, ...wildcards.slice(usedWildcards, usedWildcards + needed));
              usedWildcards += needed;
            } else {
              ok = false;
              break;
            }
          } else {
            straightCards.push(...native.slice(0, 3));
          }
        }
        if (ok) {
          const remWildcards = wildcards.slice(usedWildcards);
          const tripleRanks = new Set();
          for (let i = 0; i < T; i++) tripleRanks.add(S + i);

          if (parsed.wingType === 'single') {
            const remNormal = normalCards.filter(c => !tripleRanks.has(c.rank));
            const remAll = [...remNormal, ...remWildcards];
            if (remAll.length >= T) {
              remAll.sort((a, b) => a.rank - b.rank);
              playCandidate = [...straightCards, ...remAll.slice(0, T)];
              break;
            }
          } else {
            let activeWildcards = remWildcards;
            const pairs = [];
            for (let Q = 3; Q <= 15; Q++) {
              if (tripleRanks.has(Q)) continue;
              const pairSet = findSameRankSet(Q, 2, activeWildcards);
              if (pairSet) {
                pairs.push(pairSet);
                const uw = pairSet.filter(c => c.rank === wildcardRank).length;
                activeWildcards = activeWildcards.slice(uw);
                if (pairs.length === T) break;
              }
            }
            if (pairs.length === T) {
              const flatWings = [];
              for (const p of pairs) flatWings.push(...p);
              playCandidate = [...straightCards, ...flatWings];
              break;
            }
          }
        }
      }
    }
  } else if (parsed.type === 'quad_two') {
    for (let Q = parsed.rank + 1; Q <= 15; Q++) {
      const set = findSameRankSet(Q, 4, wildcards);
      if (set) {
        const usedWildcards = set.filter(c => c.rank === wildcardRank).length;
        const remWildcards = wildcards.slice(usedWildcards);
        const remNormal = normalCards.filter(c => c.rank !== Q);
        const remAll = [...remNormal, ...remWildcards];

        if (parsed.wingType === 'single') {
          if (remAll.length >= 2) {
            remAll.sort((a, b) => a.rank - b.rank);
            playCandidate = [...set, ...remAll.slice(0, 2)];
            break;
          }
        } else if (parsed.wingType === 'pair') {
          let activeWildcards = remWildcards;
          const pairs = [];
          for (let R_rank = 3; R_rank <= 15; R_rank++) {
            if (R_rank === Q) continue;
            const pairSet = findSameRankSet(R_rank, 2, activeWildcards);
            if (pairSet) {
              pairs.push(pairSet);
              const uw = pairSet.filter(c => c.rank === wildcardRank).length;
              activeWildcards = activeWildcards.slice(uw);
              if (pairs.length === 2) break;
            }
          }
          if (pairs.length === 2) {
            playCandidate = [...set, ...pairs[0], ...pairs[1]];
            break;
          }
        }
      }
    }
  }

  if (playCandidate) {
    return playCandidate;
  }

  const targetIsBombOrRocket = parsed.type === 'bomb' || parsed.type === 'rocket';
  if (targetIsBombOrRocket || canBomb(state, difficulty)) {
    const candidateBombs = [];
    for (let B = 3; B <= 15; B++) {
      const native = normalCounts[B] || [];
      const maxS = native.length + wildcards.length;
      for (let S = 4; S <= maxS; S++) {
        const neededWildcards = S - native.length;
        if (neededWildcards >= 0 && neededWildcards <= wildcards.length) {
          const cardsSet = [...native, ...wildcards.slice(0, neededWildcards)];
          const parsedBomb = parseHand(cardsSet, wildcardRank);
          if (parsedBomb && parsedBomb.type === 'bomb') {
            if (compareHands(targetCards, cardsSet, wildcardRank)) {
              candidateBombs.push({ cards: cardsSet, parsed: parsedBomb });
            }
          }
        }
      }
    }

    if (candidateBombs.length > 0) {
      const getBombPowerVal = (b) => {
        const t = b.parsed.bombType;
        if (t === 'soft_bomb') return 1;
        if (t === 'hard_bomb') return 2;
        if (t === 'laizi_bomb') return 3;
        if (t === 'mega_bomb') return 4;
        return 0;
      };

      candidateBombs.sort((a, b) => {
        const aPower = getBombPowerVal(a);
        const bPower = getBombPowerVal(b);
        if (aPower !== bPower) return aPower - bPower;
        if (a.parsed.bombType === 'mega_bomb') {
          if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
        }
        return a.parsed.rank - b.parsed.rank;
      });

      return candidateBombs[0].cards;
    }

    const bj = hand.find(c => c.rank === 16);
    const rj = hand.find(c => c.rank === 17);
    if (bj && rj && parsed.type !== 'rocket') {
      return [bj, rj];
    }
  }

  return null;
}

module.exports = {
  executeDizhuBotTurn
};
