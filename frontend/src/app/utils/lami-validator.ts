export function isExactValidSequence(cards: any[]): boolean {
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

export function isValidSet(cards: any[]): boolean {
  if (cards.length < 3) return false;
  const nonJokers = cards.filter(c => c.type !== 'joker');
  if (nonJokers.length === 0) return true;
  
  const value = nonJokers[0].value;
  if (nonJokers.some(c => c.value !== value)) return false;
  
  return true;
}

export function getPermutations(arr: any[]): any[][] {
  if (arr.length === 0) return [[]];
  const result: any[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = getPermutations(arr.slice(0, i).concat(arr.slice(i + 1)));
    for (const r of rest) {
      result.push([arr[i], ...r]);
    }
  }
  return result;
}

export function canConnectMeld(meld: any, tiles: any[], position: 'start' | 'end', publicMelds: any[]): boolean {
  if (!tiles || tiles.length === 0) return false;

  if (meld.type === 'straight') {
    // House Rule: Cannot connect a tile to a straight if a set of that number exists
    // ONLY applies when connecting a single tile
    if (tiles.length === 1) {
      for (const t of tiles) {
        if (t.type !== 'joker') {
          const hasMatchingSet = publicMelds.some(m => {
            if (m.type === 'set') {
              const nonJoker = m.tiles.find((c: any) => c.type !== 'joker');
              return nonJoker && nonJoker.value === t.value;
            }
            return false;
          });
          
          if (hasMatchingSet) {
            return false;
          }
        }
      }
    }

    const perms = tiles.length <= 6 ? getPermutations(tiles) : [tiles];
    let isValid = false;
    
    for (const p of perms) {
      // create a deep copy to avoid mutating the original meld or tiles during validation
      const testCopy = meld.tiles.map((t: any) => ({...t}));
      const pCopy = p.map((t: any) => ({...t}));
      
      if (position === 'start') {
        testCopy.unshift(...pCopy);
      } else {
        testCopy.push(...pCopy);
      }
      
      if (isExactValidSequence(testCopy)) {
        isValid = true;
        break;
      }
    }
    
    return isValid;
  } else {
    // Set logic
    const testCopy = meld.tiles.map((t: any) => ({...t}));
    const tCopy = tiles.map((t: any) => ({...t}));
    
    if (position === 'start') {
      testCopy.unshift(...tCopy);
    } else {
      testCopy.push(...tCopy);
    }
    return isValidSet(testCopy);
  }
}
