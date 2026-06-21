const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// This uses Application Default Credentials.
// Make sure to run `export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"`
// or if hosted on Google Cloud/Firebase, it automatically detects credentials.
admin.initializeApp({
  projectId: 'm3p-mahjong-auth-5678'
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth
};
