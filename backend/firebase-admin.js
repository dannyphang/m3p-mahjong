require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

let app;
const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (process.env.FIREBASE_PRIVATE_KEY) {
  // Use .env variables if available
  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace literal \n in string with actual newlines
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
  });
} else if (fs.existsSync(serviceAccountPath)) {
  // Use local service account key if it exists
  const serviceAccount = require(serviceAccountPath);
  app = initializeApp({
    credential: cert(serviceAccount)
  });
} else {
  // Use Application Default Credentials (e.g. on Render)
  app = initializeApp({
    projectId: 'm3p-mahjong-auth-5678'
  });
}

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

async function getPlayerCoins(uid) {
  if (!uid) return null;
  try {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (doc.exists) {
      return doc.data().coins;
    }
  } catch (err) {
    console.error('Failed to get coins for user', uid, err);
  }
  return null;
}

module.exports = {
  db,
  auth,
  updatePlayerStats,
  getPlayerCoins
};
