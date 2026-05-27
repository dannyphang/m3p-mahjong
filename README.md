# Malaysia 3-Player Mahjong

A real-time multiplayer web application for playing the fast-paced Malaysia 3-Player Mahjong variant. This project consists of a modern Angular frontend and a robust Node.js/Socket.io backend.

## Features

- **Real-Time Multiplayer**: Seamless, low-latency gameplay using WebSockets (Socket.io).
- **Malaysia 3-Player Ruleset**: Implements specific regional rules including:
  - 飞 (Fly / Joker) substitutions.
  - Automatic Flower/Animal compensation (补花).
  - Pongs, Kongs, Chows, and automated priority resolution for tile claims.
  - Advanced winning (Hu) conditions and Fan multipliers.
- **Bot Support**: Fill empty seats with automated bots (Mahjong Master, Uncle Lim, etc.) who know how to play, discard, and claim winning hands!
- **Dynamic Environments**: The frontend automatically connects to `localhost` during development and switches to the live backend server when built for production.

## Architecture

- **Frontend**: Angular 21, standalone components, dynamic environment detection.
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
   ng serve
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
ng build
```
The optimized files will be generated in the `frontend/dist/` directory, which can be deployed to any static file hosting service (e.g., Vercel, Netlify, Firebase Hosting, or GitHub Pages).

## License
MIT License
