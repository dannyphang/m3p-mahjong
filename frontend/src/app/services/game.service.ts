import { Injectable, signal, isDevMode } from '@angular/core';
import { io, Socket } from 'socket.io-client';

export interface Tile {
  type: string;
  value: any;
  key?: string;
  display?: string;
  series?: string;
  index?: number;
  claimed?: boolean;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isReady: boolean;
}

export interface Meld {
  type: string;
  tiles: Tile[];
}

export interface GameState {
  roomId: string;
  players: Player[];
  status: string;
  roundNumber: number;
  currentTurn: number;
  dealerIndex: number;
  consecutiveDealerWins: number;
  hands: { [key: string]: Tile[] };
  exposed: { [key: string]: Meld[] };
  flowers: { [key: string]: Tile[] };
  flowerPoints: { [key: string]: number };
  publicPoints: { [key: string]: number };
  playerWinds: { [key: string]: string };
  tingPaiState: { [key: string]: boolean | Tile[] };
  discards: { [key: string]: Tile[] };
  lastDiscard: { tile: Tile; playerId: string } | null;
  lastDrawnTile: { playerId: string; tile: Tile } | null;
  deckRemaining: number;
  logs: any[];
  accumulatedPoints: { [key: string]: number };
  settings: {
    enableTimer: boolean;
    timerDuration?: number;
  };
}

export function regularHandSort(hand: Tile[], honorOrder: string[]) {
  hand.sort((a, b) => {
    const typeWeight = { circle: 1, honor: 2, fly: 3 };
    const weightA = typeWeight[a.type as keyof typeof typeWeight] || 99;
    const weightB = typeWeight[b.type as keyof typeof typeWeight] || 99;

    if (weightA !== weightB) return weightA - weightB;
    if (a.type === 'circle') return (a.value || 0) - (b.value || 0);
    if (a.type === 'honor') {
      const idxA = honorOrder.indexOf(a.value);
      const idxB = honorOrder.indexOf(b.value);
      return idxA - idxB;
    }
    return 0;
  });
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  public socket: Socket | null = null;

  playerName = signal('');
  roomId = signal('room-' + Math.floor(1000 + Math.random() * 9000));
  isJoined = signal(false);
  myPlayerId = signal('');
  gameState = signal<GameState | null>(null);
  claimOptions = signal<any | null>(null);
  turnOptions = signal<any | null>(null);
  pendingClaim = signal(false);
  selectedTileIndex = signal<number | null>(null);
  tileBackStyle = signal<string>('back_1.png');
  gameOverDetails = signal<any | null>(null);
  hideGameOverModal = signal(false);
  currentLanguage = signal<'zh' | 'en'>('zh');
  showNarrator = signal(typeof window !== 'undefined' ? window.innerWidth > 900 && window.innerHeight > 600 : true);
  currentAnimation = signal<{ type: string, playerId: string, tile?: Tile } | null>(null);

  connectAndJoin() {
    if (!this.playerName().trim()) {
      alert('Please enter your name.');
      return;
    }

    const backendUrl = isDevMode() ? 'http://localhost:3000' : 'https://mahjong-new.onrender.com';
    this.socket = io(backendUrl);

    this.socket.on('connect', () => {
      this.socket?.emit('joinRoom', {
        name: this.playerName(),
        roomId: this.roomId()
      });
    });

    this.socket.on('joined', (data: { playerId: string }) => {
      this.myPlayerId.set(data.playerId);
      this.isJoined.set(true);
    });

    let eventQueue: any[] = [];
    let isProcessingQueue = false;

    const processQueue = () => {
      if (isProcessingQueue || eventQueue.length === 0) return;
      isProcessingQueue = true;
      const event = eventQueue.shift();

      if (event.type === 'actionAnim') {
        this.currentAnimation.set(event.data);
        setTimeout(() => {
          this.currentAnimation.set(null);
          setTimeout(() => {
            isProcessingQueue = false;
            processQueue();
          }, 50);
        }, 1500);
      } else if (event.type === 'gameState') {
        const state = event.data;
        const myId = this.myPlayerId();
        if (myId && state.hands && state.hands[myId]) {
          const oldState = this.gameState();
          if (oldState && oldState.hands && oldState.hands[myId]) {
            const oldHand = oldState.hands[myId];
            const newHand = state.hands[myId];
            const newHandCopy = [...newHand];
            const orderedNewHand = [];
            for (const oldTile of oldHand) {
              const idx = newHandCopy.findIndex((t: any) => t.key === oldTile.key);
              if (idx !== -1) {
                orderedNewHand.push(newHandCopy.splice(idx, 1)[0]);
              }
            }
            orderedNewHand.push(...newHandCopy);
            state.hands[myId] = orderedNewHand;
          } else {
            const honorOrder = ['东', '南', '西', '北', '中', '发', '白'];
            regularHandSort(state.hands[myId], honorOrder);
          }
        }

        this.gameState.set(state);
        this.pendingClaim.set(false);

        const myTurnIdx = state.players.findIndex((p: any) => p.id === this.myPlayerId());
        if (state.currentTurn !== myTurnIdx) {
          this.turnOptions.set(null);
        }

        const currentClaim = this.claimOptions();
        if (currentClaim) {
          if (!state.lastDiscard || state.lastDiscard.tile.key !== currentClaim.tile.key) {
            this.claimOptions.set(null);
          }
        }
        isProcessingQueue = false;
        processQueue();
      } else if (event.type === 'turnOptions') {
        this.turnOptions.set(event.data);
        isProcessingQueue = false;
        processQueue();
      } else if (event.type === 'claimOptions') {
        this.claimOptions.set(event.data);
        isProcessingQueue = false;
        processQueue();
      } else if (event.type === 'gameOver') {
        const details = event.data;
        this.hideGameOverModal.set(false);
        const honorOrder = ['东', '南', '西', '北', '中', '发', '白'];

        if (details && details.hand) {
          if (details.winningTile) {
            const wIdx = details.hand.findIndex((t: Tile) => t.type === details.winningTile.type && t.value === details.winningTile.value);
            if (wIdx !== -1) details.hand.splice(wIdx, 1);
          }
          regularHandSort(details.hand, honorOrder);
        }

        if (details && details.allHands) {
          Object.values(details.allHands).forEach((handArray: any) => {
            if (Array.isArray(handArray)) regularHandSort(handArray, honorOrder);
          });
        }

        this.gameOverDetails.set(details);
        isProcessingQueue = false;
        processQueue();
      }
    };

    this.socket.on('actionAnim', (data) => { eventQueue.push({ type: 'actionAnim', data }); processQueue(); });
    this.socket.on('gameState', (data) => { eventQueue.push({ type: 'gameState', data }); processQueue(); });
    this.socket.on('turnOptions', (data) => { eventQueue.push({ type: 'turnOptions', data }); processQueue(); });
    this.socket.on('claimOptions', (data) => { eventQueue.push({ type: 'claimOptions', data }); processQueue(); });
    this.socket.on('gameOver', (data) => { eventQueue.push({ type: 'gameOver', data }); processQueue(); });
    this.socket.on('errorMsg', (msg: string) => {
      alert(msg);
      this.socket?.disconnect();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.isJoined.set(false);
    this.gameState.set(null);
    this.myPlayerId.set('');
    this.roomId.set('');
  }
}
