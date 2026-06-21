const { isValidStraightFlush, isValidSet, checkCombinations, canConnectBruteForce } = require('./lami_engine');

function executeBotTurn(gameState, io) {
  const playerIndex = gameState.currentTurn;
  const player = gameState.players[playerIndex];
  if (!player.isBot || player.burned || gameState.status !== 'PLAYING') return;

  const hand = [...gameState.hands[player.id]];
  
  setTimeout(() => {
    // 1. If not broken ice, find a straight flush to break ice.
    if (!player.hasBrokenIce) {
      const sf = checkCombinations(hand, 3, isValidStraightFlush);
      if (sf) {
        const success = gameState.playMeld(player.id, sf, io);
        if (success) return;
      }
      // Can't break ice -> pass (will burn)
      gameState.passTurn(player.id, io);
      return;
    }

    // 2. Try to connect to existing melds
    for (const tile of hand) {
      for (const meld of gameState.publicMelds) {
        
        // House Rule: Cannot connect a tile to a straight if a set of that number exists
        let forbidden = false;
        if (meld.type === 'straight' && tile.type !== 'joker') {
          const hasMatchingSet = gameState.publicMelds.some(m => {
            if (m.type === 'set') {
              const nonJoker = m.tiles.find(c => c.type !== 'joker');
              return nonJoker && nonJoker.value === tile.value;
            }
            return false;
          });
          if (hasMatchingSet) forbidden = true;
        }

        if (forbidden) continue;

        const position = canConnectBruteForce(tile, meld);
        if (position) {
          const success = gameState.connectMeld(player.id, meld.id, tile, position, io);
          if (success) return;
        }
      }
    }

    // 3. Try to play a new set or straight flush
    const newMeld = checkCombinations(hand, 3, isValidSet) || checkCombinations(hand, 3, isValidStraightFlush);
    if (newMeld) {
      const success = gameState.playMeld(player.id, newMeld, io);
      if (success) return;
    }

    // 4. Pass turn if nothing to do
    gameState.passTurn(player.id, io);

  }, 1500);
}

module.exports = {
  executeBotTurn
};
