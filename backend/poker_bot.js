// backend/poker_bot.js
// Texas Hold'em Poker Bot AI

const { evaluateHand } = require('./poker_engine');

function decidePokerBotAction(bot, gameState) {
  const myId = bot.id;
  const myHand = gameState.hands[myId] || [];
  const communityCards = gameState.communityCards || [];
  const currentBet = gameState.currentBet || 0;
  const myCurrentBet = gameState.roundBets[myId] || 0;
  const toCall = currentBet - myCurrentBet;
  const myChips = bot.coins || 0;
  const pot = gameState.pot || 0;
  const minBet = gameState.settings?.bigBlind || 20;
  const difficulty = bot.difficulty || 'normal';

  // Can check if toCall is 0
  const canCheck = toCall === 0;

  // 1. PRE-FLOP LOGIC (0 community cards)
  if (communityCards.length === 0) {
    if (myHand.length < 2) return { action: canCheck ? 'check' : 'fold' };

    const c1 = myHand[0];
    const c2 = myHand[1];
    const isPair = c1.rank === c2.rank;
    const isSuited = c1.suit === c2.suit;
    const highRank = Math.max(c1.rank, c2.rank);
    const lowRank = Math.min(c1.rank, c2.rank);
    const isConnected = highRank - lowRank === 1;

    // Premium hands: AA, KK, QQ, JJ, AK
    const isPremium = (isPair && highRank >= 11) || (highRank === 14 && lowRank >= 13);
    // Strong hands: TT, 99, 88, AQ, AJ, KQ
    const isStrong = (isPair && highRank >= 8) || (highRank >= 13 && lowRank >= 11);
    // Playable hands: pairs, suited aces, suited connectors
    const isPlayable = isPair || (highRank === 14 && isSuited) || (isSuited && isConnected && lowRank >= 7);

    if (isPremium) {
      // Raise or 3-bet
      const raiseAmount = Math.min(myChips, currentBet + minBet * (difficulty === 'hard' ? 3 : 2));
      if (raiseAmount > currentBet && myChips > toCall) {
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    if (isStrong) {
      if (toCall <= minBet * 3) {
        if (difficulty === 'hard' && Math.random() < 0.4 && myChips > toCall + minBet) {
          return { action: 'raise', amount: Math.min(myChips, currentBet + minBet * 2) };
        }
        return { action: 'call' };
      }
      return toCall <= minBet * 5 ? { action: 'call' } : { action: 'fold' };
    }

    if (isPlayable) {
      if (toCall <= minBet * 2) {
        return { action: 'call' };
      }
      return canCheck ? { action: 'check' } : { action: 'fold' };
    }

    // Weak hand
    if (canCheck) return { action: 'check' };
    if (toCall <= minBet && difficulty === 'easy' && Math.random() < 0.5) return { action: 'call' };
    return { action: 'fold' };
  }

  // 2. POST-FLOP, TURN, AND RIVER LOGIC
  const allCards = [...myHand, ...communityCards];
  const evalResult = evaluateHand(allCards);
  const handRank = evalResult.type.rank; // 0 to 9

  // Monster hands (Straight, Flush, Full House, Quads, Straight Flush)
  if (handRank >= 4) {
    if (Math.random() < (difficulty === 'hard' ? 0.75 : 0.5) && myChips > toCall) {
      const betSize = Math.max(minBet, Math.floor(pot * 0.6));
      const raiseAmount = Math.min(myChips, currentBet + betSize);
      if (raiseAmount > currentBet) {
        return { action: 'raise', amount: raiseAmount };
      }
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  // Three of a Kind or Two Pair
  if (handRank >= 2) {
    if (toCall === 0) {
      if (Math.random() < 0.6) {
        const betSize = Math.max(minBet, Math.floor(pot * 0.4));
        const raiseAmount = Math.min(myChips, currentBet + betSize);
        if (raiseAmount > currentBet) return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check' };
    }
    if (toCall <= pot * 0.8) return { action: 'call' };
    return difficulty === 'hard' && toCall <= pot * 1.2 ? { action: 'call' } : { action: 'fold' };
  }

  // One Pair
  if (handRank === 1) {
    if (canCheck) {
      if (difficulty !== 'easy' && Math.random() < 0.3) {
        const raiseAmount = Math.min(myChips, currentBet + minBet);
        if (raiseAmount > currentBet) return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check' };
    }
    if (toCall <= minBet * 2 || toCall <= pot * 0.3) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // High card (weak)
  if (canCheck) {
    // Bluff chance for hard bots
    if (difficulty === 'hard' && communityCards.length >= 4 && Math.random() < 0.15) {
      const raiseAmount = Math.min(myChips, currentBet + minBet * 2);
      if (raiseAmount > currentBet) return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'check' };
  }

  return { action: 'fold' };
}

module.exports = {
  decidePokerBotAction
};
