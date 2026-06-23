# M3P Mahjong & Lami

A real-time multiplayer web application featuring two distinct tile-based games: the fast-paced **Malaysia 3-Player Mahjong** and the strategic **Lami Mahjong (Rummy)**. This project consists of a modern Angular frontend and a robust Node.js/Socket.io backend.

## Features

### Malaysia 3-Player Mahjong
- **Real-Time Multiplayer**: Seamless, low-latency gameplay using WebSockets (Socket.io).
- **Malaysia 3-Player Ruleset**: Implements specific regional rules including:
  - 飞 (Fly / Joker) substitutions.
  - Automatic Flower/Animal compensation (补花).
  - Pongs, Kongs, Chows, and automated priority resolution for tile claims.
  - Advanced winning (Hu) conditions, payout logic, and Fan multipliers.
- **Bot Support**: Fill empty seats with automated bots (Mahjong Master, Uncle Lim, etc.) who know how to play, discard, and claim winning hands!

### Lami Mahjong (Rummy)
- **Rummy-Style Gameplay**: A localized variation of Rummy played with Mahjong tiles.
- **Dynamic Melds**: Create runs (straights) and sets (three/four-of-a-kind).
- **Interactive Board**: Play tiles onto existing melds on the shared board to reduce your hand.
- **Scoring System**: Specialized payout and coin logic based on remaining un-melded tiles.
- **Bot Support**: Automated bots that intelligently form melds and play off the board.

### Platform Features
- **Dynamic Environments**: The frontend automatically connects to `localhost` during development and switches to the live backend server when built for production.
- **Responsive & Premium UI**: Beautiful wood textures, mobile-responsive bounds, and smooth CSS tile animations.

## Architecture

- **Frontend**: Angular 21, standalone components, dynamic environment detection, Tailwind-free vanilla CSS.
- **Backend**: Node.js, Express, and Socket.io for managing real-time game states and lobbies.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Angular CLI](https://angular.dev/tools/cli) installed globally (`npm install -g @angular/cli`)

### Backend Setup (Node.js + Socket.io)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

#### Firebase Admin Configuration
The backend requires Firebase Admin credentials to access Firestore and Authentication. You have two ways to configure this:

**Option A: Local Development (`service-account.json`)**
1. Go to your [Firebase Console](https://console.firebase.google.com/) -> Project Settings -> Service Accounts.
2. Click **"Generate new private key"** to download a JSON file.
3. Rename the downloaded file to `service-account.json` and place it directly inside the `backend/` folder. *(Note: This file is git-ignored, keep it secure!)*

**Option B: Production Environment Variables**
For production environments (like Render), inject the credentials using these Environment Variables instead of a file:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` *(Make sure to replace actual line breaks with `\n` in the string)*

3. Start the server (runs on port `3000` by default):
   ```bash
   npm run dev
   ```

### Frontend Setup (Angular)

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run start
   ```
4. Open your browser and navigate to `http://localhost:4200/`.

*Note: The frontend will automatically detect it is running in development mode and connect to your local backend at `http://localhost:3000`.*

---

## Deployment

### Backend
The backend can be easily deployed to services like **Render**, Heroku, or DigitalOcean.
- Set the Environment Variable: `NODE_ENV = production`.
- The frontend is already configured to point to the production backend URL (`https://mahjong-new.onrender.com`) when built for production.

### Frontend

To build the frontend for production:
```bash
cd frontend
npm run build
```
The optimized files will be generated in the `frontend/dist/` directory. 

#### Deploying to Firebase Hosting
This project is already pre-configured for **Firebase Hosting**. To deploy:

1. Install the Firebase CLI (if you haven't already):
   ```bash
   npm install -g firebase-tools
   ```
2. Log into your Firebase account:
   ```bash
   firebase login
   ```
3. Deploy the application:
   ```bash
   firebase deploy --only hosting
   ```
*(Note: Ensure your active Firebase project is correctly set in the `.firebaserc` file before deploying.)*

## License
MIT License
