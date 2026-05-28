/**
 * Malaysia 3-Player Mahjong (M3P) Game Engine
 * Handles tiles, shuffling, dealing, compensation (补花), action validation, 
 * recursive hand solving with Jokers (飞), and complex fan scoring.
 */

// Tile definitions
const TILE_TYPES = {
  // Circles / Tubes (36 tiles)
  CIRCLE: 'circle', // 1-9
  // Honors (28 tiles)
  HONOR: 'honor',   // 东, 南, 西, 北, 中, 发, 白 (E, S, W, N, C, F, P)
  // Joker / Fly (4 tiles)
  FLY: 'fly',       // 飞
  // Flowers (8 tiles)
  FLOWER: 'flower', // 春, 夏, 秋, 冬 (Seasons), 梅, 兰, 菊, 竹 (Gentlemen)
  // Animals (4 tiles)
  ANIMAL: 'animal'  // 猫, 老鼠, 公鸡, 蜈蚣 (Cat, Mouse, Rooster, Centipede)
};

const FLOWER_SERIES = {
  SEASONS: ['春', '夏', '秋', '冬'],
  GENTLEMEN: ['梅', '兰', '菊', '竹']
};

const ANIMAL_PAIRS = [
  { predator: '猫', prey: '老鼠' },
  { predator: '公鸡', prey: '蜈蚣' }
];

// Initialize a full M3P deck of 88 tiles
function createDeck() {
  const deck = [];

  // 1. Circles: 1-9 Circles, 4 of each (36 tiles)
  for (let i = 1; i <= 9; i++) {
    for (let j = 0; j < 4; j++) {
      deck.push({ type: TILE_TYPES.CIRCLE, value: i, key: `C_${i}_${j}`, display: `${i}筒` });
    }
  }

  // 2. Honors: East, South, West, North, Red, Green, White Dragon, 4 of each (28 tiles)
  const honors = ['东', '南', '西', '北', '中', '发', '白'];
  honors.forEach(h => {
    for (let j = 0; j < 4; j++) {
      deck.push({ type: TILE_TYPES.HONOR, value: h, key: `H_${h}_${j}`, display: h });
    }
  });

  // 3. Fly / Joker: 4 tiles
  for (let j = 0; j < 4; j++) {
    deck.push({ type: TILE_TYPES.FLY, value: '飞', key: `F_飞_${j}`, display: '飞' });
  }

  // 4. Flowers: 16 tiles
  Object.keys(FLOWER_SERIES).forEach(seriesKey => {
    FLOWER_SERIES[seriesKey].forEach((flowerName, index) => {
      deck.push({ 
        type: TILE_TYPES.FLOWER, 
        value: flowerName, 
        series: seriesKey, 
        index: index + 1,
        key: `FL_${flowerName}`, 
        display: flowerName 
      });
    });
  });

  // 5. Animals: 4 tiles
  const animals = ['猫', '老鼠', '公鸡', '蜈蚣'];
  animals.forEach(a => {
    deck.push({ type: TILE_TYPES.ANIMAL, value: a, key: `A_${a}`, display: a });
  });

  return deck;
}

// Fisher-Yates Shuffle
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Check if a tile is a flower or animal
function isFlowerOrAnimal(tile) {
  return tile.type === TILE_TYPES.FLOWER || tile.type === TILE_TYPES.ANIMAL;
}

// Compensation (补花)
// Draws replacement tiles from the back of the deck (tail) for any flowers/animals in hand
function compensateFlowers(hand, deck, flowersArea) {
  let hasFlower = true;
  let compensatedCount = 0;

  while (hasFlower) {
    hasFlower = false;
    for (let i = 0; i < hand.length; i++) {
      if (isFlowerOrAnimal(hand[i])) {
        const flowerTile = hand.splice(i, 1)[0];
        flowersArea.push(flowerTile);
        
        // Draw replacement from the tail end of the deck
        if (deck.length > 0) {
          const replacement = deck.pop();
          hand.push(replacement);
        }
        hasFlower = true;
        compensatedCount++;
        break; // Restart check since list changed
      }
    }
  }
  return compensatedCount;
}

// Can Pong (碰)
// Player needs at least 2 matching real tiles, OR 1 matching real tile + 1 Joker. (Max 1 Joker allowed)
function canPong(hand, tile) {
  if (tile.type === TILE_TYPES.FLY) return false; // Cannot Pong Fly
  const matching = hand.filter(t => t.type === tile.type && String(t.value) === String(tile.value));
  const jokers = hand.filter(t => t.type === TILE_TYPES.FLY);
  
  if (matching.length >= 2) return true;
  if (matching.length === 1 && jokers.length >= 1) return true;
  return false;
}

// Can Kong (杠)
// Player needs exactly 3 matching tiles in hand. Jokers cannot be used for Kong.
function canKong(hand, tile) {
  if (tile.type === TILE_TYPES.FLY) return false;
  const matching = hand.filter(t => t.type === tile.type && String(t.value) === String(tile.value));
  return matching.length >= 3;
}

// Can Chow (吃)
// Evaluates sequence pairs from hand circles with the discarded card
function canChow(hand, tile) {
  if (tile.type !== TILE_TYPES.CIRCLE) return false;
  const val = parseInt(tile.value, 10);
  if (isNaN(val)) return false;

  const handCircles = hand
    .filter(t => t.type === TILE_TYPES.CIRCLE)
    .map(t => parseInt(t.value, 10));
  const jokers = hand.filter(t => t.type === TILE_TYPES.FLY).length;

  const options = [];
  
  const checkOption = (v1, v2) => {
    let needed = 0;
    if (!handCircles.includes(v1)) needed++;
    if (!handCircles.includes(v2)) needed++;
    if (jokers >= needed) {
      options.push({ v1, v2, display: `${v1}, ${v2} 筒` });
    }
  };

  // 1. Left Chow (V-2, V-1)
  if (val >= 3) checkOption(val - 2, val - 1);
  // 2. Middle Chow (V-1, V+1)
  if (val >= 2 && val <= 8) checkOption(val - 1, val + 1);
  // 3. Right Chow (V+1, V+2)
  if (val <= 7) checkOption(val + 1, val + 2);

  return options.length > 0 ? options : null;
}

/**
 * Backtracking Check if hand is a winning hand.
 * In M3P, there is NO Chow (吃), only Pongs (3 identical tiles) and Kongs (4 identical).
 * So a winning hand consists of N Pongs/Kongs (exposed or in-hand) + exactly 1 Pair.
 * Hand size must be 3M + 2 tiles (e.g. 14, 11, 8, 5, 2 tiles).
 */
function isWinningHand(handTiles, allowSequences = true) {
  // Extract fly tiles (Jokers)
  const flyCount = handTiles.filter(t => t.type === TILE_TYPES.FLY).length;
  const normalTiles = handTiles.filter(t => t.type !== TILE_TYPES.FLY);

  // Edge case: 4 flying cards (四飞) is an automatic win regardless of hand!
  if (flyCount >= 4) return true;

  // Group tiles
  // circles: index 1-9 for easy sequential checking
  const circles = new Array(10).fill(0);
  // honors: we map to string names or just treat as a separate list
  const honorsCount = {};

  normalTiles.forEach(t => {
    if (t.type === TILE_TYPES.CIRCLE) {
      circles[t.value]++;
    } else if (t.type === TILE_TYPES.HONOR) {
      honorsCount[t.value] = (honorsCount[t.value] || 0) + 1;
    }
  });

  const honorKeys = Object.keys(honorsCount);

  // Helper backtracking function
  function solve(honorsIdx, jokersLeft, pairFormed) {
    // 1. Process Honors first (they can only form Pongs or Pairs)
    for (let i = honorsIdx; i < honorKeys.length; i++) {
      const key = honorKeys[i];
      const qty = honorsCount[key];
      if (qty > 0) {
        // Try Pair
        if (!pairFormed) {
          const costPair = Math.max(0, 2 - qty);
          if (jokersLeft >= costPair) {
            honorsCount[key] -= (2 - costPair);
            if (solve(i, jokersLeft - costPair, true)) {
              honorsCount[key] += (2 - costPair);
              return true;
            }
            honorsCount[key] += (2 - costPair);
          }
        }
        
        // Try Pong
        const costPong = Math.max(0, 3 - qty);
        if (jokersLeft >= costPong) {
          honorsCount[key] -= (3 - costPong);
          if (solve(i, jokersLeft - costPong, pairFormed)) {
            honorsCount[key] += (3 - costPong);
            return true;
          }
          honorsCount[key] += (3 - costPong);
        }
        
        // If we must process this tile but no combination worked, invalid hand path
        return false;
      }
    }

    // 2. Process Circles (they can form Pongs, Pairs, and Sequences)
    for (let i = 1; i <= 9; i++) {
      if (circles[i] > 0) {
        // Try Pair
        if (!pairFormed) {
          const costPair = Math.max(0, 2 - circles[i]);
          if (jokersLeft >= costPair) {
            circles[i] -= (2 - costPair);
            if (solve(honorsIdx, jokersLeft - costPair, true)) {
              circles[i] += (2 - costPair);
              return true;
            }
            circles[i] += (2 - costPair);
          }
        }

        // Try Pong
        const costPong = Math.max(0, 3 - circles[i]);
        if (jokersLeft >= costPong) {
          circles[i] -= (3 - costPong);
          if (solve(honorsIdx, jokersLeft - costPong, pairFormed)) {
            circles[i] += (3 - costPong);
            return true;
          }
          circles[i] += (3 - costPong);
        }

        // Try Sequence (Chow)
        if (allowSequences && i <= 7) {
          let c1 = circles[i] > 0 ? 1 : 0;
          let c2 = circles[i + 1] > 0 ? 1 : 0;
          let c3 = circles[i + 2] > 0 ? 1 : 0;
          let costSeq = (1 - c1) + (1 - c2) + (1 - c3);
          
          if (jokersLeft >= costSeq) {
            circles[i] -= c1;
            circles[i + 1] -= c2;
            circles[i + 2] -= c3;
            if (solve(honorsIdx, jokersLeft - costSeq, pairFormed)) {
              circles[i] += c1;
              circles[i + 1] += c2;
              circles[i + 2] += c3;
              return true;
            }
            circles[i] += c1;
            circles[i + 1] += c2;
            circles[i + 2] += c3;
          }
        }
        
        // If we must process this circle tile but no combination worked, invalid hand path
        return false;
      }
    }

    // Base Case: All tiles consumed
    // Check if remaining jokers can form pongs/pairs properly
    if (pairFormed) {
      return jokersLeft % 3 === 0;
    } else {
      return jokersLeft >= 2 && (jokersLeft - 2) % 3 === 0;
    }
  }

  return solve(0, flyCount, false);
}

/**
 * M3P Fan Scoring Calculator
 * Hand is verified, now calculate the total fan value.
 */
function calculateFan(handTiles, melds, flowers, winTile, isSelfDraw, isDealer, consecutiveDealerWins = 0, playerWind = '东', isHuaShang = false, isGangShang = false, isTianHu = false, isDiHu = false, isRobbingKong = false) {
  const breakdown = [];
  let totalFan = 0;

  if (isRobbingKong) {
    totalFan += 1;
    breakdown.push({ name: '抢杠 (Robbing the Kong)', fan: 1 });
  }

  // 1. Check for 4 Flyers (四飞) - Instant 10 Fan
  const flyCountInHand = handTiles.filter(t => t.type === TILE_TYPES.FLY).length;
  const flyCountInMelds = melds.flatMap(m => m.tiles).filter(t => t.type === TILE_TYPES.FLY).length;
  const flyCount = flyCountInHand + flyCountInMelds;
  if (flyCount >= 4) {
    if (isTianHu) breakdown.push({ name: '天胡 (Heavenly Hand)', fan: 10 });
    if (isDiHu) breakdown.push({ name: '地胡 (Earthly Hand)', fan: 10 });
    breakdown.push({ name: '四飞 (Four Jokers)', fan: 10 });
    return { totalFan: 10, breakdown };
  }

  if (isTianHu) {
    totalFan += 10;
    breakdown.push({ name: '天胡 (Heavenly Hand)', fan: 10 });
  } else if (isDiHu) {
    totalFan += 10;
    breakdown.push({ name: '地胡 (Earthly Hand)', fan: 10 });
  }

  // 2. Flowers, Animals, Jokers, and Wind points calculation based on spreadsheet point system
  let flowerPoints = 0;

  const flowerValues = flowers.filter(f => f.type === TILE_TYPES.FLOWER).map(f => f.value);
  const animalValues = flowers.filter(f => f.type === TILE_TYPES.ANIMAL).map(f => f.value);

  // Check Seasons Full Set (春, 夏, 秋, 冬) -> 3 points
  const seasonsSet = ['春', '夏', '秋', '冬'];
  const hasAllSeasons = seasonsSet.every(s => flowerValues.includes(s));
  if (hasAllSeasons) {
    flowerPoints += 3;
    breakdown.push({ name: '全套四季 (Full Seasons Set)', fan: 3 });
  } else {
    // Individual Seasons points
    seasonsSet.forEach(s => {
      if (flowerValues.includes(s)) {
        let pts = 0;
        if (s === '春' && playerWind === '东') pts = 1;
        if (s === '夏' && playerWind === '南') pts = 1;
        if (s === '秋' && playerWind === '西') pts = 1;
        if (s === '冬') pts = 1;

        if (pts > 0) {
          flowerPoints += pts;
          breakdown.push({ name: `花牌: ${s} (Season)`, fan: pts });
        }
      }
    });
  }

  // Check Gentlemen Full Set (梅, 兰, 菊, 竹) -> 3 points
  const gentlemenSet = ['梅', '兰', '菊', '竹'];
  const hasAllGentlemen = gentlemenSet.every(g => flowerValues.includes(g));
  if (hasAllGentlemen) {
    flowerPoints += 3;
    breakdown.push({ name: '全套四君子 (Full Gentlemen Set)', fan: 3 });
  } else {
    // Individual Gentlemen points
    gentlemenSet.forEach(g => {
      if (flowerValues.includes(g)) {
        let pts = 0;
        if (g === '梅' && playerWind === '东') pts = 1;
        if (g === '兰' && playerWind === '南') pts = 1;
        if (g === '菊' && playerWind === '西') pts = 1;
        if (g === '竹') pts = 1;

        if (pts > 0) {
          flowerPoints += pts;
          breakdown.push({ name: `花牌: ${g} (Gentlemen)`, fan: pts });
        }
      }
    });
  }

  // Animals scoring: 猫, 老鼠, 公鸡, 蜈蚣 give 1 point each for everyone
  const animalsSet = ['猫', '老鼠', '公鸡', '蜈蚣'];
  animalsSet.forEach(a => {
    // Note: client display might say "鼠", "鸡", "蜈", but internally value is the full string
    const matchName = a === '老鼠' ? '老鼠' : (a === '公鸡' ? '公鸡' : (a === '蜈蚣' ? '蜈蚣' : '猫'));
    // Support loose match for animal names (e.g. "鼠", "鸡", "蜈" in spreadsheet)
    const found = animalValues.find(val => val.includes(matchName) || matchName.includes(val) || (matchName === '老鼠' && val.includes('鼠')) || (matchName === '公鸡' && val.includes('鸡')) || (matchName === '蜈蚣' && val.includes('蜈')));
    if (found) {
      flowerPoints += 1;
      breakdown.push({ name: `动物牌: ${a}`, fan: 1 });
    }
  });

  // Jokers (飞) scoring: 1 point per exposed Joker (炖飞) in the flowers list
  const exposedFlyCount = flowers.filter(f => f.type === TILE_TYPES.FLY).length;
  if (exposedFlyCount > 0) {
    flowerPoints += exposedFlyCount;
    breakdown.push({ name: `已炖百搭飞牌 (${exposedFlyCount}张)`, fan: exposedFlyCount });
  }

  // Helper to test if a target tile configuration is valid using Jokers
  const testHonorPattern = (targetCounts) => {
    let tempHand = [...handTiles];
    
    for (const [val, reqCount] of Object.entries(targetCounts)) {
      const meldCount = melds.flatMap(m => m.tiles).filter(t => t.value === val || t.substitutedFor === val).length;
      let neededInHand = Math.max(0, reqCount - meldCount);
      
      for (let i = 0; i < neededInHand; i++) {
        const idx = tempHand.findIndex(t => t.type === TILE_TYPES.HONOR && t.value === val);
        if (idx !== -1) {
          tempHand.splice(idx, 1);
        } else {
          const jokerIdx = tempHand.findIndex(t => t.type === TILE_TYPES.FLY);
          if (jokerIdx !== -1) {
            tempHand.splice(jokerIdx, 1);
          } else {
            return false; 
          }
        }
      }
      for (let i = 0; i < neededInHand; i++) {
        tempHand.push({ type: TILE_TYPES.HONOR, value: val, display: val });
      }
    }
    return isWinningHand(tempHand);
  };

  // 3. Optimal Honor Pattern Scoring (Winds and Dragons)
  let bestHonorFan = 0;
  let bestHonorBreakdown = [];
  const honorsList = ['东', '南', '西', '北', '中', '发', '白'];
  
  const exploreHonorConfigs = (index, currentConfig, currentPairsCount) => {
    if (index === honorsList.length) {
      let fan = 0;
      let bd = [];

      let windPongs = 0, windPairs = 0;
      ['东', '南', '西', '北'].forEach(w => {
        if (currentConfig[w] === 3) windPongs++;
        if (currentConfig[w] === 2) windPairs++;
      });
      if (windPongs === 4) {
        fan += 10;
        bd.push({ name: '大四喜 (Great Four Winds)', fan: 10 });
      } else if (windPongs === 3 && windPairs === 1) {
        fan += 10;
        bd.push({ name: '小四喜 (Little Four Winds)', fan: 10 });
      } else {
        ['东', '南', '西', '北'].forEach(w => {
          if (currentConfig[w] === 3) {
            let pts = 0;
            if (w === '东') pts = playerWind === '东' ? 2 : 1;
            else if (w === '南' && playerWind === '南') pts = 1;
            else if (w === '西' && playerWind === '西') pts = 1;
            else if (w === '北') pts = 1;
            if (pts > 0) {
              fan += pts;
              bd.push({ name: `3x ${w} (Wind)`, fan: pts });
            }
          }
        });
      }

      let dragonPongs = 0, dragonPairs = 0;
      ['中', '发', '白'].forEach(d => {
        if (currentConfig[d] === 3) dragonPongs++;
        if (currentConfig[d] === 2) dragonPairs++;
      });
      if (dragonPongs === 3) {
        fan += 10;
        bd.push({ name: '大三元 (Great Three Dragons)', fan: 10 });
      } else if (dragonPongs === 2 && dragonPairs === 1) {
        fan += 3;
        bd.push({ name: '小三元 (Little Three Dragons)', fan: 3 });
      } else {
        ['中', '发', '白'].forEach(d => {
          if (currentConfig[d] === 3) {
            fan += 1;
            bd.push({ name: `3x ${d} (Dragon)`, fan: 1 });
          }
        });
      }

      if (fan > bestHonorFan) {
        const target = {};
        for (const [k, v] of Object.entries(currentConfig)) {
          if (v > 0) target[k] = v;
        }
        if (testHonorPattern(target)) {
          bestHonorFan = fan;
          bestHonorBreakdown = bd;
        }
      }
      return;
    }

    const honor = honorsList[index];
    currentConfig[honor] = 0;
    exploreHonorConfigs(index + 1, currentConfig, currentPairsCount);
    
    currentConfig[honor] = 3;
    exploreHonorConfigs(index + 1, currentConfig, currentPairsCount);
    
    if (currentPairsCount === 0) {
      currentConfig[honor] = 2;
      exploreHonorConfigs(index + 1, currentConfig, 1);
    }
  };

  exploreHonorConfigs(0, {}, 0);
  
  totalFan += flowerPoints + bestHonorFan;
  breakdown.push(...bestHonorBreakdown);

  // 4. Hand Pattern Scoring
  const allTilesInHand = [...handTiles];

  // Group by suit/type
  const allTilesCombined = [...handTiles, ...melds.flatMap(m => m.tiles)];
  const circles = allTilesCombined.filter(t => t.type === TILE_TYPES.CIRCLE);
  const honors = allTilesCombined.filter(t => t.type === TILE_TYPES.HONOR);
  const flies = allTilesCombined.filter(t => t.type === TILE_TYPES.FLY);

  // Clear Suit checks (excluding Fly cards)
  const isCirclesOnly = circles.length > 0 && honors.length === 0;
  const isHonorsOnly = honors.length > 0 && circles.length === 0;
  const isMixed = circles.length > 0 && honors.length > 0;

  if (isCirclesOnly) {
    totalFan += 2;
    breakdown.push({ name: '清一色 (Pure Suit)', fan: 2 });
  } else if (isHonorsOnly) {
    totalFan += 10;
    breakdown.push({ name: '字一色 (All Honors)', fan: 10 });
  }

  // Win Bonus: +1 point/fan for any winning hand
  totalFan += 1;
  breakdown.push({ name: '胡牌 (Winning Hand)', fan: 1 });

  if (isHuaShang) {
    totalFan += 1;
    breakdown.push({ name: '花上/飞上开花 (Win on Flower/Joker Replacement)', fan: 1 });
  }

  if (isGangShang) {
    totalFan += 1;
    breakdown.push({ name: '杠上开花 (Win on Kong Replacement)', fan: 1 });
  }

  // Pong Pong Hu Check (碰碰胡)
  // All melds are Pongs/Kongs (no sequence/Chow melds exist exposed or in hand)
  let isPongPong = true;
  if (melds && melds.some(m => m.type === 'chow')) {
    isPongPong = false;
  } else {
    // Check if the hand can win without sequences
    if (!isWinningHand(handTiles, false)) {
      isPongPong = false;
    }
  }

  if (isPongPong) {
    totalFan += 2;
    breakdown.push({ name: '碰碰胡 (Pong-Pong Hand)', fan: 2 });
  }

  // Eighteen Arhats (十八罗汉) - 4 Kongs
  const kongsCount = melds.filter(m => m.type === 'kong').length;
  if (kongsCount === 4) {
    totalFan += 10;
    breakdown.push({ name: '十八罗汉 (Eighteen Arhats)', fan: 10 });
  }

  // La Ta Hu / No Flowers (邋遢胡 / 无花)
  if (flowers.length === 0) {
    totalFan += 10;
    breakdown.push({ name: '邋遢胡 (No Flowers)', fan: 10 });
  }

  // Cap at 10 Fan max (爆番/Limit)
  if (totalFan > 10) {
    totalFan = 10;
  }

  return { totalFan, breakdown };
}

function calculateFlowerPoints(flowers, playerWind) {
  let points = 0;
  const flowerValues = flowers.filter(f => f.type === TILE_TYPES.FLOWER).map(f => f.value);
  const animalValues = flowers.filter(f => f.type === TILE_TYPES.ANIMAL).map(f => f.value);

  // Check Seasons Full Set (春, 夏, 秋, 冬) -> 3 points
  const seasonsSet = ['春', '夏', '秋', '冬'];
  const hasAllSeasons = seasonsSet.every(s => flowerValues.includes(s));
  if (hasAllSeasons) {
    points += 3;
  } else {
    // Individual Seasons points
    seasonsSet.forEach(s => {
      if (flowerValues.includes(s)) {
        if (s === '春' && playerWind === '东') points += 1;
        if (s === '夏' && playerWind === '南') points += 1;
        if (s === '秋' && playerWind === '西') points += 1;
        if (s === '冬') points += 1;
      }
    });
  }

  // Check Gentlemen Full Set (梅, 兰, 菊, 竹) -> 3 points
  const gentlemenSet = ['梅', '兰', '菊', '竹'];
  const hasAllGentlemen = gentlemenSet.every(g => flowerValues.includes(g));
  if (hasAllGentlemen) {
    points += 3;
  } else {
    // Individual Gentlemen points
    gentlemenSet.forEach(g => {
      if (flowerValues.includes(g)) {
        if (g === '梅' && playerWind === '东') points += 1;
        if (g === '兰' && playerWind === '南') points += 1;
        if (g === '菊' && playerWind === '西') points += 1;
        if (g === '竹') points += 1;
      }
    });
  }

  // Animals scoring: 猫, 老鼠, 公鸡, 蜈蚣 give 1 point each for everyone
  const animalsSet = ['猫', '老鼠', '公鸡', '蜈蚣'];
  animalsSet.forEach(a => {
    const matchName = a === '老鼠' ? '老鼠' : (a === '公鸡' ? '公鸡' : (a === '蜈蚣' ? '蜈蚣' : '猫'));
    const found = animalValues.find(val => val.includes(matchName) || matchName.includes(val) || (matchName === '老鼠' && val.includes('鼠')) || (matchName === '公鸡' && val.includes('鸡')) || (matchName === '蜈蚣' && val.includes('蜈')));
    if (found) {
      points += 1;
    }
  });

  // Exposed Jokers (飞 / 炖飞) scoring: 1 point each
  const exposedFlyCount = flowers.filter(f => f.type === TILE_TYPES.FLY).length;
  points += exposedFlyCount;

  return points;
}

function calculatePublicPoints(flowers, exposedMelds, playerWind) {
  let pts = calculateFlowerPoints(flowers, playerWind);

  const windSet = ['东', '南', '西', '北'];
  const dragons = ['中', '发', '白'];
  
  if (exposedMelds) {
    exposedMelds.forEach(meld => {
      if (meld.type === 'pong' || meld.type === 'kong') {
        const w = meld.tiles[0].value;
        if (windSet.includes(w)) {
          if (w === '东') pts += (playerWind === '东' ? 2 : 1);
          else if (w === '南' && playerWind === '南') pts += 1;
          else if (w === '西' && playerWind === '西') pts += 1;
          else if (w === '北') pts += 1;
        } else if (dragons.includes(w)) {
          pts += 1;
        }
      }
    });
  }

  return pts;
}

module.exports = {
  TILE_TYPES,
  FLOWER_SERIES,
  createDeck,
  shuffleDeck,
  isFlowerOrAnimal,
  compensateFlowers,
  canPong,
  canKong,
  canChow,
  isWinningHand,
  calculateFan,
  calculateFlowerPoints,
  calculatePublicPoints
};
