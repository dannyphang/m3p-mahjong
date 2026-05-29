import { Component, signal, effect, OnDestroy, ViewChild, ElementRef, AfterViewChecked, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';

function regularHandSort(hand: Tile[], honorOrder: string[]) {
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

interface Tile {
  type: string;
  value: any;
  key?: string;
  display?: string;
  series?: string;
  index?: number;
  claimed?: boolean;
}

interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isReady: boolean;
}

interface Meld {
  type: string;
  tiles: Tile[];
}

interface GameState {
  roomId: string;
  players: Player[];
  status: string; // WAITING, PLAYING, GAME_OVER
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
  logs: string[];
  accumulatedPoints: { [key: string]: number };
  settings: {
    enableTimer: boolean;
  };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy, AfterViewChecked {
  // Lobby State Signals
  playerName = signal('');
  roomId = signal('room-' + Math.floor(1000 + Math.random() * 9000));
  isJoined = signal(false);
  myPlayerId = signal('');
  
  // Game Sync Signals
  gameState = signal<GameState | null>(null);
  
  // Claim options signal
  claimOptions = signal<{ tile: Tile; canHu: boolean; huFan: number; canPong: boolean; canKong: boolean; canChow?: any[] | null } | null>(null);
  
  // Self turn options
  turnOptions = signal<{ canHu: boolean; huFan: number; canSelfKong: (Tile & { isUpgrade?: boolean })[] | null; canReplaceJoker?: any[] | null } | null>(null);
  
  // Pending Claim State
  pendingClaim = signal(false);
  
  // Selected tile index for discard
  selectedTileIndex = signal<number | null>(null);
  
  // GameOver Summary Details
  gameOverDetails = signal<any | null>(null);
  hideGameOverModal = signal(false);

  // Drag & Drop State tracking
  draggedIndex = signal<number | null>(null);
  dragOverIndex = signal<number | null>(null);

  // UI State Signals
  showNarrator = signal(true);
  hoveredTile = signal<Tile | null>(null);
  currentAnimation = signal<{type: string, playerId: string, tile?: Tile} | null>(null);

  @ViewChild('logsContainer') private logsContainer!: ElementRef;

  private socket: Socket | null = null;

  constructor() {
    // Automatically focus or handle signals if needed
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.logsContainer && this.logsContainer.nativeElement) {
        this.logsContainer.nativeElement.scrollTop = this.logsContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
  }

  joinRoom() {
    if (!this.playerName().trim()) {
      alert('Please enter your name.');
      return;
    }

    // Connect to Node.js backend
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
        const applyState = () => {
          // If auto-sorting is active, sort player's hand instantly upon new state arrival
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
          setTimeout(() => this.scrollToBottom(), 50);
          
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
        };
        applyState();
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
            if (wIdx !== -1) {
              details.hand.splice(wIdx, 1);
            }
          }
          regularHandSort(details.hand, honorOrder);
        }
        
        if (details && details.allHands) {
          Object.values(details.allHands).forEach((handArray: any) => {
            if (Array.isArray(handArray)) {
              regularHandSort(handArray, honorOrder);
            }
          });
        }
        
        this.gameOverDetails.set(details);
        isProcessingQueue = false;
        processQueue();
      }
    };

    this.socket.on('actionAnim', (animData: {type: string, playerId: string, tile?: Tile}) => {
      eventQueue.push({ type: 'actionAnim', data: animData });
      processQueue();
    });

    this.socket.on('gameState', (state: GameState) => {
      eventQueue.push({ type: 'gameState', data: state });
      processQueue();
    });

    this.socket.on('turnOptions', (options) => {
      eventQueue.push({ type: 'turnOptions', data: options });
      processQueue();
    });

    this.socket.on('claimOptions', (options) => {
      eventQueue.push({ type: 'claimOptions', data: options });
      processQueue();
    });

    this.socket.on('gameOver', (details) => {
      eventQueue.push({ type: 'gameOver', data: details });
      processQueue();
    });

    this.socket.on('errorMsg', (msg: string) => {
      alert(msg);
      this.socket?.disconnect();
    });
  }

  toggleReady() {
    this.socket?.emit('toggleReady', {
      roomId: this.roomId(),
      playerId: this.myPlayerId()
    });
  }

  addBot() {
    this.socket?.emit('addBot', {
      roomId: this.roomId()
    });
  }

  toggleTimer() {
    this.socket?.emit('toggleTimer', {
      roomId: this.roomId()
    });
  }

  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', index.toString());
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverIndex.set(index);
  }

  onDragEnd() {
    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
  }

  onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    this.draggedIndex.set(null);
    this.dragOverIndex.set(null);
    
    if (!event.dataTransfer) return;

    const sourceIndexStr = event.dataTransfer.getData('text/plain');
    if (sourceIndexStr === '') return;

    const sourceIndex = parseInt(sourceIndexStr, 10);
    const state = this.gameState();
    const myId = this.myPlayerId();

    if (!state || !myId || !state.hands[myId]) return;

    const hand = state.hands[myId];
    if (sourceIndex < 0 || sourceIndex >= hand.length || targetIndex < 0 || targetIndex >= hand.length) return;

    // Rearrange locally
    const [movedTile] = hand.splice(sourceIndex, 1);
    hand.splice(targetIndex, 0, movedTile);

    // Sync state to trigger view reload
    this.gameState.set({ ...state });
  }

  sortHand() {
    this.applySort();
  }

  applySort() {
    const state = this.gameState();
    const myId = this.myPlayerId();
    if (!state || !myId || !state.hands[myId]) return;

    const honorOrder = ['东', '南', '西', '北', '中', '发', '白'];
    const hand = state.hands[myId];

    const hasDrawn = state.lastDrawnTile && state.lastDrawnTile.playerId === myId;

    if (hasDrawn) {
      const drawnTileKey = state.lastDrawnTile!.tile.key;
      const idx = hand.findIndex(t => t.key === drawnTileKey);
      
      if (idx !== -1) {
        const [newTile] = hand.splice(idx, 1);
        regularHandSort(hand, honorOrder);
        state.hands[myId] = [...hand, newTile];
      } else {
        regularHandSort(hand, honorOrder);
      }
    } else {
      regularHandSort(hand, honorOrder);
    }

    this.gameState.set({ ...state });
  }

  selectTile(index: number) {
    const state = this.gameState();
    if (!state) return;
    
    // Check if it is my turn
    const myTurnIdx = state.players.findIndex(p => p.id === this.myPlayerId());
    if (state.currentTurn !== myTurnIdx) return;

    if (this.selectedTileIndex() === index) {
      // Second click: Discard
      this.discardSelected();
    } else {
      this.selectedTileIndex.set(index);
    }
  }

  discardSelected() {
    const idx = this.selectedTileIndex();
    if (idx === null) return;

    const myHand = this.gameState()?.hands[this.myPlayerId()];
    if (!myHand) return;

    const tile = myHand[idx];
    this.socket?.emit('discard', {
      roomId: this.roomId(),
      playerId: this.myPlayerId(),
      tile
    });

    this.selectedTileIndex.set(null);
    this.turnOptions.set(null);
  }

  claimAction(action: string) {
    this.socket?.emit('claimResponse', {
      roomId: this.roomId(),
      playerId: this.myPlayerId(),
      claimType: action
    });
    this.claimOptions.set(null);
    this.pendingClaim.set(true);
  }

  declareSelfHu() {
    this.socket?.emit('declareSelfHu', {
      roomId: this.roomId(),
      playerId: this.myPlayerId()
    });
    this.turnOptions.set(null);
  }

  declareSelfKong(option: any) {
    this.socket?.emit('declareSelfKong', {
      roomId: this.roomId(),
      playerId: this.myPlayerId(),
      option
    });
    this.turnOptions.set(null);
  }

  replaceJoker(opt: any) {
    this.socket?.emit('replaceJoker', {
      roomId: this.roomId(),
      playerId: this.myPlayerId(),
      opt
    });
    this.turnOptions.set(null);
  }

  cancelSelfAction() {
    this.turnOptions.set(null);
  }

  restartGame() {
    this.socket?.emit('restartGame', { roomId: this.roomId() });
    this.gameOverDetails.set(null);
    this.hideGameOverModal.set(false);
  }

  getTileStyleClass(tile: Tile) {
    if (tile.type === 'circle') return 'circle';
    if (tile.type === 'honor') {
      if (['中', '发'].includes(tile.value)) return 'honor-red';
      if (['东', '南', '西', '北'].includes(tile.value)) return 'honor-blue';
      return 'honor-green';
    }
    if (tile.type === 'fly') return 'fly';
    if (tile.type === 'flower') return 'flower';
    if (tile.type === 'animal') return 'animal';
    return '';
  }

  getTileImageUrl(tile: Tile): string {
    if (!tile) return '';
    if (tile.type === 'back') return '/assets/images/mahjong/hide.png';
    if (tile.type === 'circle') return `/assets/images/mahjong/circle_${tile.value}.png`;
    if (tile.type === 'fly') return '/assets/images/mahjong/joker.png';
    
    if (tile.type === 'honor') {
      const honorMap: { [key: string]: string } = {
        '东': 'east.png',
        '南': 'south.png',
        '西': 'west.png',
        '北': 'north.png',
        '中': 'red.png',
        '发': 'green.png',
        '白': 'white.png'
      };
      return `/assets/images/mahjong/${honorMap[tile.value]}`;
    }
    
    if (tile.type === 'flower') {
      const flowerMap: { [key: string]: string } = {
        '春': 'spring.png',
        '夏': 'summer.png',
        '秋': 'autumn.png',
        '冬': 'winter.png',
        '梅': 'plum.png',
        '兰': 'orchid.png',
        '竹': 'bamboo.png',
        '菊': 'chrysanthemum.png'
      };
      return `/assets/images/mahjong/${flowerMap[tile.value]}`;
    }
    
    if (tile.type === 'animal') {
      const animalMap: { [key: string]: string } = {
        '猫': 'cat.png',
        '老鼠': 'rat.png',
        '公鸡': 'rooster.png',
        '蜈蚣': 'centipede.png'
      };
      return `/assets/images/mahjong/${animalMap[tile.value] || 'cat.png'}`;
    }
    
    return '';
  }

  getRemainingPlayerPosition(offset: number): Player | null {
    const state = this.gameState();
    if (!state) return null;

    const myIdx = state.players.findIndex(p => p.id === this.myPlayerId());
    if (myIdx === -1) return null;

    const targetIdx = (myIdx + offset) % 3;
    return state.players[targetIdx] || null;
  }

  getOpponentDiscards(offsetIndex: number): Tile[] {
    const s = this.gameState();
    if (!s || !s.players) return [];
    
    const myIndex = s.players.findIndex(p => p.id === this.myPlayerId());
    if (myIndex === -1) return [];
    
    const oppIndex = (myIndex + offsetIndex) % 3;
    const oppPlayer = s.players[oppIndex];
    if (!oppPlayer) return [];
    
    return s.discards[oppPlayer.id] || [];
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  asArray(val: any): any[] {
    return val as any[];
  }

  getOpponentHand(offset: number): Tile[] {
    const opp = this.getRemainingPlayerPosition(offset);
    if (!opp) return [];
    return this.gameState()?.hands[opp.id] || [];
  }

  getOpponentExposed(offset: number): Meld[] {
    const opp = this.getRemainingPlayerPosition(offset);
    if (!opp) return [];
    return this.gameState()?.exposed[opp.id] || [];
  }

  getOpponentFlowers(offset: number): Tile[] {
    const opp = this.getRemainingPlayerPosition(offset);
    if (!opp) return [];
    return this.gameState()?.flowers[opp.id] || [];
  }



  isMyTurn(): boolean {
    const state = this.gameState();
    if (!state) return false;
    const myIdx = state.players.findIndex(p => p.id === this.myPlayerId());
    return state.currentTurn === myIdx;
  }

  ngOnDestroy() {
    this.socket?.disconnect();
  }
}
