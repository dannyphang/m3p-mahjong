const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin SDK
// This uses Application Default Credentials.
const app = initializeApp({
  projectId: 'm3p-mahjong-auth-5678'
});

const db = getFirestore(app);
const auth = getAuth(app);

async function updatePlayerStats(uid, gameType, netCoins, isWin, fanWon) {
  if (!uid) return;
  try {
    const userRef = db.collection('users').doc(uid);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      if (!doc.exists) return;
      
      const data = doc.data();
      const type = gameType === 'lami' ? 'lami' : 'mahjong';
      const currentStats = data.stats?.[type] || { totalGamesPlayed: 0, totalWins: 0, totalFanWon: 0 };
      
      const updates = {
        coins: (data.coins || 0) + netCoins,
      };
      
      updates[`stats.${type}.totalGamesPlayed`] = currentStats.totalGamesPlayed + 1;
      updates[`stats.${type}.totalWins`] = currentStats.totalWins + (isWin ? 1 : 0);
      updates[`stats.${type}.totalFanWon`] = currentStats.totalFanWon + (fanWon || 0);

      transaction.update(userRef, updates);
    });
  } catch (err) {
    console.error('Failed to update stats for user', uid, err);
  }
}

module.exports = {
  db,
  auth,
  updatePlayerStats
};
