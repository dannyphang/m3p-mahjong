require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

let app;
const serviceAccountPath = path.join(__dirname, 'service-account.json');

try {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const hasValidKey = privateKey && typeof privateKey === 'string' && privateKey.includes('-----BEGIN PRIVATE KEY-----');
  if (hasValidKey && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
    // Use .env variables if available
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace literal \n in string with actual newlines
        privateKey: privateKey.replace(/\\n/g, '\n'),
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
} catch (err) {
  console.warn('[AI Studio] Firebase Admin app init notice:', err.message);
}

let db = null;
let auth = null;
try {
  if (app) {
    db = getFirestore(app);
    auth = getAuth(app);
  }
} catch (err) {
  console.warn('[AI Studio] Firestore/Auth init notice:', err.message);
}

async function updatePlayerStats(uid, gameType, netCoins, isWin, extraStats = {}) {
  if (!uid || !db) return;
  try {
    const userRef = db.collection('users').doc(uid);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      if (!doc.exists) return;
      
      const data = doc.data();
      const type = gameType === 'lami' ? 'lami' : gameType === 'dizhu' ? 'dizhu' : 'mahjong';
      const currentStats = data.stats?.[type] || { totalGamesPlayed: 0, totalWins: 0 };
      
      const updates = {
        coins: (data.coins || 0) + netCoins,
      };
      
      const currentWinStreak = currentStats.currentWinStreak || 0;
      const highestWinStreak = currentStats.highestWinStreak || 0;
      const highestCoinWin = currentStats.highestCoinWin || 0;
      const highestCoinLose = currentStats.highestCoinLose || 0;

      let newCurrentWinStreak = isWin ? currentWinStreak + 1 : 0;
      let newHighestWinStreak = Math.max(highestWinStreak, newCurrentWinStreak);
      
      let newHighestCoinWin = highestCoinWin;
      if (netCoins > 0 && netCoins > highestCoinWin) {
        newHighestCoinWin = netCoins;
      }

      let newHighestCoinLose = highestCoinLose;
      if (netCoins < 0 && Math.abs(netCoins) > highestCoinLose) {
        newHighestCoinLose = Math.abs(netCoins);
      }
      
      updates[`stats.${type}.totalGamesPlayed`] = currentStats.totalGamesPlayed + 1;
      updates[`stats.${type}.totalWins`] = currentStats.totalWins + (isWin ? 1 : 0);
      updates[`stats.${type}.currentWinStreak`] = newCurrentWinStreak;
      updates[`stats.${type}.highestWinStreak`] = newHighestWinStreak;
      updates[`stats.${type}.highestCoinWin`] = newHighestCoinWin;
      updates[`stats.${type}.highestCoinLose`] = newHighestCoinLose;
      
      // Update new coin gained/lost totals
      let totalCoinsGained = currentStats.totalCoinsGained || 0;
      let totalCoinsLost = currentStats.totalCoinsLost || 0;
      if (netCoins > 0) totalCoinsGained += netCoins;
      if (netCoins < 0) totalCoinsLost += Math.abs(netCoins);
      updates[`stats.${type}.totalCoinsGained`] = totalCoinsGained;
      updates[`stats.${type}.totalCoinsLost`] = totalCoinsLost;

      // Handle all other extraStats dynamically
      for (const [key, val] of Object.entries(extraStats)) {
        if (typeof val === 'number') {
           const prevVal = currentStats[key] || 0;
           if (key === 'highestMultiplier' || key === 'maxBombsSingleGame') {
             updates[`stats.${type}.${key}`] = Math.max(prevVal, val);
           } else {
             updates[`stats.${type}.${key}`] = prevVal + val;
           }
        } else if (typeof val === 'string') {
           updates[`stats.${type}.${key}`] = val;
        }
      }

      transaction.update(userRef, updates);
    });
  } catch (err) {
    console.error('Failed to update stats for user', uid, err);
  }
}

async function getPlayerCoins(uid) {
  if (!uid || !db) return null;
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
