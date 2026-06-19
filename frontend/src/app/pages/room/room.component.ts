import { Component, inject, ViewChild, ElementRef, AfterViewChecked, effect, signal, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { GameService, Tile, Meld, GameState, regularHandSort } from '../../services/game.service';
import { TRANSLATIONS } from '../../i18n';
import { Router } from '@angular/router';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './room.component.html'
})
export class RoomComponent implements AfterViewChecked, OnInit {
  gameService = inject(GameService);
  router = inject(Router);
  titleService = inject(Title);

  @ViewChild('logsContainer') private logsContainer!: ElementRef;

  draggedIndex: number | null = null;
  dragOverIndex: number | null = null;

  ngOnInit() {
    this.titleService.setTitle('M3P Mahjong');
  }

  constructor() {
    effect(() => {
      if (!this.gameService.isJoined()) {
        this.router.navigate(['/']);
      }
      // Trigger scroll when logs or showNarrator state changes
      const logsCount = this.gameService.gameState()?.logs?.length || 0;
      const showNarrator = this.gameService.showNarrator();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.logsContainer && this.logsContainer.nativeElement) {
        this.logsContainer.nativeElement.scrollTop = this.logsContainer.nativeElement.scrollHeight;
      }
    } catch (err) { }
  }

  hoveredTile = signal<Tile | null>(null);

  get gameState() { return this.gameService.gameState(); }
  get myPlayerId() { return this.gameService.myPlayerId(); }
  get currentAnimation() { return this.gameService.currentAnimation(); }
  get turnOptions() { return this.gameService.turnOptions(); }
  get claimOptions() { return this.gameService.claimOptions(); }
  get pendingClaim() { return this.gameService.pendingClaim(); }
  get selectedTileIndex() { return this.gameService.selectedTileIndex(); }
  get gameOverDetails() { return this.gameService.gameOverDetails(); }
  get hideGameOverModal() { return this.gameService.hideGameOverModal(); }
  get showNarrator() { return this.gameService.showNarrator(); }

  set hideGameOverModal(val: boolean) {
    this.gameService.hideGameOverModal.set(val);
  }

  t(key: string, params?: Record<string, any>): string {
    const lang = this.gameService.currentLanguage();
    let str = TRANSLATIONS[lang as keyof typeof TRANSLATIONS]?.[key] || key;
    if (params) {
      Object.keys(params).forEach(k => {
        str = str.replace(`{${k}}`, params[k]);
      });
    }
    return str;
  }

  formatLog(log: any): string {
    if (typeof log === 'string') return log;
    if (log && log.key) {
      return this.t(log.key, log.params);
    }
    return '';
  }

  toggleReady() {
    this.gameService.socket?.emit('toggleReady', {
      roomId: this.gameService.roomId(),
      playerId: this.gameService.myPlayerId()
    });
  }

  selectedBotDifficulty: 'easy' | 'normal' | 'hard' = 'easy';

  addBot() {
    this.gameService.socket?.emit('addBot', {
      roomId: this.gameService.roomId(),
      difficulty: this.selectedBotDifficulty
    });
  }

  removeBot(botId: string) {
    this.gameService.socket?.emit('removeBot', {
      roomId: this.gameService.roomId(),
      botId: botId
    });
  }

  toggleTimerStatus(event: any) {
    const isChecked = event.target.checked;
    const duration = this.gameState?.settings?.timerDuration || 10;
    this.gameService.socket?.emit('updateTimer', {
      roomId: this.gameService.roomId(),
      enableTimer: isChecked,
      timerDuration: duration
    });
  }

  updateTimerDuration(event: any) {
    const duration = event.target.value;
    const isEnabled = this.gameState?.settings?.enableTimer || false;
    this.gameService.socket?.emit('updateTimer', {
      roomId: this.gameService.roomId(),
      enableTimer: isEnabled,
      timerDuration: duration
    });
  }

  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', index.toString());
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverIndex = index;
  }

  onDragEnd() {
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  onCdkDrop(event: CdkDragDrop<Tile[]>) {
    if (event.previousContainer === event.container) {
      const state = this.gameState;
      const myId = this.myPlayerId;
      if (!state || !myId || !state.hands[myId]) return;

      const hand = state.hands[myId];
      moveItemInArray(hand, event.previousIndex, event.currentIndex);

      this.gameService.gameState.set({ ...state });
    }
  }

  onDiscardDrop(event: CdkDragDrop<any>) {
    if (event.previousContainer !== event.container) {
      this.gameService.selectedTileIndex.set(event.previousIndex);
      this.discardSelected();
    }
  }

  sortHand() {
    this.applySort();
  }

  applySort() {
    const state = this.gameState;
    const myId = this.myPlayerId;
    if (!state || !myId || !state.hands[myId]) return;

    const honorOrder = ['东', '南', '西', '北', '中', '发', '白'];
    const hand = state.hands[myId];
    const hasDrawn = state.lastDrawnTile && state.lastDrawnTile.playerId === myId;

    if (hasDrawn) {
      const drawnTileKey = state.lastDrawnTile!.tile.key;
      const idx = hand.findIndex((t: Tile) => t.key === drawnTileKey);

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

    this.gameService.gameState.set({ ...state });
  }

  selectTile(index: number) {
    const state = this.gameState;
    if (!state) return;

    const myTurnIdx = state.players.findIndex((p: any) => p.id === this.myPlayerId);
    if (state.currentTurn !== myTurnIdx) return;

    if (this.gameService.selectedTileIndex() === index) {
      this.discardSelected();
    } else {
      this.gameService.selectedTileIndex.set(index);
    }
  }

  discardSelected() {
    const idx = this.gameService.selectedTileIndex();
    if (idx === null) return;

    const myHand = this.gameState?.hands[this.myPlayerId];
    if (!myHand) return;

    const tile = myHand[idx];
    this.gameService.socket?.emit('discard', {
      roomId: this.gameService.roomId(),
      playerId: this.myPlayerId,
      tile
    });

    this.gameService.selectedTileIndex.set(null);
    this.gameService.turnOptions.set(null);
  }

  claimAction(action: string) {
    this.gameService.socket?.emit('claimResponse', {
      roomId: this.gameService.roomId(),
      playerId: this.myPlayerId,
      claimType: action
    });
    this.gameService.claimOptions.set(null);
    this.gameService.pendingClaim.set(true);
  }

  declareSelfHu() {
    this.gameService.socket?.emit('declareSelfHu', {
      roomId: this.gameService.roomId(),
      playerId: this.myPlayerId
    });
    this.gameService.turnOptions.set(null);
  }

  declareSelfKong(option: any) {
    this.gameService.socket?.emit('declareSelfKong', {
      roomId: this.gameService.roomId(),
      playerId: this.myPlayerId,
      option
    });
    this.gameService.turnOptions.set(null);
  }

  replaceJoker(opt: any) {
    this.gameService.socket?.emit('replaceJoker', {
      roomId: this.gameService.roomId(),
      playerId: this.myPlayerId,
      opt
    });
    this.gameService.turnOptions.set(null);
  }

  cancelSelfAction() {
    this.gameService.turnOptions.set(null);
  }

  restartGame() {
    this.gameService.socket?.emit('restartGame', { roomId: this.gameService.roomId() });
    this.gameService.gameOverDetails.set(null);
    this.gameService.hideGameOverModal.set(false);
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
    if (tile.type === 'back') return `/assets/images/mahjong/${this.gameService.tileBackStyle()}`;
    if (tile.type === 'circle') return `/assets/images/mahjong/circle_${tile.value}.png`;
    if (tile.type === 'fly') return '/assets/images/mahjong/joker.png';

    if (tile.type === 'honor') {
      const honorMap: { [key: string]: string } = {
        '东': 'east.png', '南': 'south.png', '西': 'west.png', '北': 'north.png',
        '中': 'red.png', '发': 'green.png', '白': 'white.png'
      };
      return `/assets/images/mahjong/${honorMap[tile.value]}`;
    }

    if (tile.type === 'flower') {
      const flowerMap: { [key: string]: string } = {
        '春': 'spring.png', '夏': 'summer.png', '秋': 'autumn.png', '冬': 'winter.png',
        '梅': 'plum.png', '兰': 'orchid.png', '竹': 'bamboo.png', '菊': 'chrysanthemum.png'
      };
      return `/assets/images/mahjong/${flowerMap[tile.value]}`;
    }

    if (tile.type === 'animal') {
      const animalMap: { [key: string]: string } = {
        '猫': 'cat.png', '老鼠': 'rat.png', '公鸡': 'rooster.png', '蜈蚣': 'centipede.png'
      };
      return `/assets/images/mahjong/${animalMap[tile.value] || 'cat.png'}`;
    }

    return '';
  }

  getRemainingPlayerPosition(offset: number): any | null {
    const state = this.gameState;
    if (!state) return null;

    const myIdx = state.players.findIndex((p: any) => p.id === this.myPlayerId);
    if (myIdx === -1) return null;

    const targetIdx = (myIdx + offset) % 3;
    return state.players[targetIdx] || null;
  }

  getOpponentDiscards(offsetIndex: number): Tile[] {
    const s = this.gameState;
    if (!s || !s.players) return [];

    const myIndex = s.players.findIndex((p: any) => p.id === this.myPlayerId);
    if (myIndex === -1) return [];

    const oppIndex = (myIndex + offsetIndex) % 3;
    const oppPlayer = s.players[oppIndex];
    if (!oppPlayer) return [];

    return s.discards?.[oppPlayer.id] || [];
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
    return this.gameState?.hands[opp.id] || [];
  }

  getOpponentExposed(offset: number): Meld[] {
    const opp = this.getRemainingPlayerPosition(offset);
    if (!opp) return [];
    return this.gameState?.exposed?.[opp.id] || [];
  }

  getOpponentFlowers(offset: number): Tile[] {
    const opp = this.getRemainingPlayerPosition(offset);
    if (!opp) return [];
    return this.gameState?.flowers?.[opp.id] || [];
  }

  isMyTurn(): boolean {
    const state = this.gameState;
    if (!state) return false;
    const myIdx = state.players.findIndex((p: any) => p.id === this.myPlayerId);
    return state.currentTurn === myIdx;
  }
}
