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

module.exports = {
  db,
  auth
};
