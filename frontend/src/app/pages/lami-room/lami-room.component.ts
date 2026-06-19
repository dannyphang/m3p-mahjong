import { Component, inject, OnInit, OnDestroy, computed, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { GameService, Player } from '../../services/game.service';
import { LamiTileComponent } from '../../components/lami-tile/lami-tile.component';
import { FormsModule } from '@angular/forms';
import { TRANSLATIONS } from '../../i18n';

@Component({
  selector: 'app-lami-room',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, LamiTileComponent],
  templateUrl: './lami-room.component.html',
  styleUrls: ['./lami-room.component.css']
})
export class LamiRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  route = inject(ActivatedRoute);
  router = inject(Router);
  gameService = inject(GameService);

  @ViewChild('logsContainer') private logsContainer!: ElementRef;

  constructor() {
    effect(() => {
      const logsCount = this.gameService.gameState()?.logs?.length || 0;
      const showNarrator = this.gameService.showNarrator();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  gameStateSignal = this.gameService.gameState;
  playerIdSignal = this.gameService.myPlayerId;
  selectedTiles: any[] = [];
  showMeldOptions = false;
  meldOptions: any[][] = [];

  showGameOver = false;
  private lastStatus = '';

  playerColors = ['#ffeb3b', '#4fc3f7', '#81c784', '#ff8a65', '#ba68c8'];

  getPlayerColor(playerId: string): string {
    if (!this.state || !this.state.players) return '#ffeb3b';
    const idx = this.state.players.findIndex((p: any) => p.id === playerId);
    if (idx === -1) return '#ffeb3b';
    return this.playerColors[idx % this.playerColors.length];
  }

  get state() {
    const s = this.gameStateSignal();
    if (s) {
      if (s.status === 'GAME_OVER' && this.lastStatus !== 'GAME_OVER') {
        this.showGameOver = false;
        setTimeout(() => {
          this.showGameOver = true;
        }, 3500);
      }
      this.lastStatus = s.status;
    }
    return s;
  }

  get myId() {
    return this.playerIdSignal();
  }

  get myPlayer() {
    return this.state?.players.find((p: any) => p.id === this.myId);
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.logsContainer && this.logsContainer.nativeElement) {
        setTimeout(() => {
          if (this.logsContainer && this.logsContainer.nativeElement) {
            this.logsContainer.nativeElement.scrollTop = this.logsContainer.nativeElement.scrollHeight;
          }
        }, 10);
      }
    } catch (err) {}
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

  myHand = computed(() => {
    const s = this.state;
    const pid = this.myId;
    if (s && s.hands && s.hands[pid]) {
      return s.hands[pid];
    }
    return [];
  });

  onCdkDrop(event: CdkDragDrop<any[]>) {
    const hand = [...(this.state?.hands[this.myId] || [])];
    if (!hand || event.previousIndex === event.currentIndex) return;

    if (event.previousContainer === event.container) {
      moveItemInArray(hand, event.previousIndex, event.currentIndex);
      
      this.gameService.socket?.emit('lamiSortHand', {
        roomId: this.gameService.roomId(),
        playerId: this.myId,
        sortedHand: hand
      });
    }
  }

  getOpponents(): (Player & { index: number; position: string })[] {
    const s = this.state;
    if (!s) return [];
    const myIndex = s.players.findIndex(p => p.id === this.myId);
    if (myIndex === -1) return [];
    
    const opponents: (Player & { index: number; position: string })[] = [];
    const positions = ['right', 'top', 'left'];
    for (let i = 1; i < s.players.length; i++) {
      const idx = (myIndex + i) % s.players.length;
      opponents.push({
        ...s.players[idx],
        index: idx,
        position: positions[i - 1] || 'top'
      });
    }
    return opponents;
  }

  getSortedHandForDisplay(playerId: string) {
    const hand = this.state?.hands[playerId] || [];
    const suitOrder: Record<string, number> = { red: 1, blue: 2, green: 3, yellow: 4 };
    return [...hand].sort((a, b) => {
      if (a.type === 'joker' && b.type === 'joker') return 0;
      if (a.type === 'joker') return 1;
      if (b.type === 'joker') return -1;
      if (suitOrder[a.suit!] !== suitOrder[b.suit!]) return suitOrder[a.suit!] - suitOrder[b.suit!];
      return a.value - b.value;
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const name = params['name'] || 'Player';
      const roomId = params['id'] || Math.random().toString(36).substr(2, 6);
      this.gameService.playerName.set(name);
      this.gameService.roomId.set(roomId);
      this.gameService.connectAndJoin('lami');
    });
  }



  ngOnDestroy() {
    this.gameService.disconnect();
  }

  toggleTileSelection(tile: any) {
    const idx = this.selectedTiles.findIndex(t => t.id === tile.id);
    if (idx !== -1) {
      this.selectedTiles.splice(idx, 1);
    } else {
      this.selectedTiles.push(tile);
    }
  }

  isSelected(tile: any) {
    return this.selectedTiles.some(t => t.id === tile.id);
  }

  getStraightFlushOptions(tiles: any[]): any[][] {
    const nonJokers = tiles.filter(t => t.type !== 'joker').sort((a, b) => a.value - b.value);
    const jokers = tiles.filter(t => t.type === 'joker');
    
    if (nonJokers.length === 0 || jokers.length === 0) return [];
    
    const suit = nonJokers[0].suit;
    if (!nonJokers.every(t => t.suit === suit)) return [];
    
    let gaps = 0;
    for(let i=0; i<nonJokers.length - 1; i++) {
      const diff = nonJokers[i+1].value - nonJokers[i].value;
      if (diff === 0) return [];
      gaps += (diff - 1);
    }
    
    if (gaps > jokers.length) return [];
    
    const core: any[] = [];
    let expected = nonJokers[0].value;
    let nonJokerIdx = 0;
    let usedJokers = 0;
    
    while(nonJokerIdx < nonJokers.length) {
      if (nonJokers[nonJokerIdx].value === expected) {
        core.push(nonJokers[nonJokerIdx]);
        nonJokerIdx++;
      } else {
        core.push(jokers[usedJokers]);
        usedJokers++;
      }
      expected++;
    }
    
    const remainingJokers = jokers.length - usedJokers;
    if (remainingJokers === 0) return []; // No choices
    
    const options: any[][] = [];
    const unusedJokersList = jokers.slice(usedJokers);
    for(let left=0; left <= remainingJokers; left++) {
      const right = remainingJokers - left;
      const leftPart = unusedJokersList.slice(0, left);
      const rightPart = unusedJokersList.slice(left);
      options.push([...leftPart, ...core, ...rightPart]);
    }
    
    return options;
  }

  playMeld() {
    const options = this.getStraightFlushOptions(this.selectedTiles);
    if (options.length > 1) {
      this.meldOptions = options;
      this.showMeldOptions = true;
    } else {
      this.sendMeld(this.selectedTiles);
    }
  }

  sendMeld(tiles: any[]) {
    this.gameService.socket?.emit('lamiPlayMeld', {
      roomId: this.state?.roomId,
      playerId: this.myId,
      tiles: tiles
    });
    this.selectedTiles = [];
    this.showMeldOptions = false;
  }

  connectMeld(meldId: string, position: 'start' | 'end') {
    if (this.selectedTiles.length === 0) return;
    this.gameService.socket?.emit('lamiConnectMeld', {
      roomId: this.state?.roomId,
      playerId: this.myId,
      meldId,
      tiles: this.selectedTiles,
      position
    });
    this.selectedTiles = [];
  }

  passTurn() {
    this.gameService.socket?.emit('lamiPassTurn', {
      roomId: this.state?.roomId,
      playerId: this.myId
    });
    this.selectedTiles = [];
  }

  toggleReady() {
    this.gameService.toggleReady();
  }

  selectedBotDifficulty: 'easy' | 'normal' | 'hard' = 'easy';

  addBot() {
    this.gameService.socket?.emit('addBot', {
      roomId: this.state?.roomId,
      difficulty: this.selectedBotDifficulty
    });
  }

  removeBot(botId: string) {
    this.gameService.socket?.emit('removeBot', {
      roomId: this.state?.roomId,
      botId: botId
    });
  }

  sortHand() {
    const s = this.state;
    const pid = this.myId;
    if (!s || !pid || !s.hands[pid]) return;

    const hand = [...s.hands[pid]];
    
    hand.sort((a, b) => {
      // Put jokers at the end
      if (a.type === 'joker' && b.type !== 'joker') return 1;
      if (a.type !== 'joker' && b.type === 'joker') return -1;
      if (a.type === 'joker' && b.type === 'joker') return 0;
      
      // Sort by suit first: red, blue, green, yellow
      const suitOrder: any = { red: 1, blue: 2, green: 3, yellow: 4 };
      const suitA = suitOrder[a.suit as string] || 0;
      const suitB = suitOrder[b.suit as string] || 0;
      
      if (suitA !== suitB) {
        return suitA - suitB;
      }
      
      // Then by value
      return a.value - b.value;
    });

    // Update the state locally for immediate feedback
    s.hands[pid] = hand;
    this.gameService.gameState.set({ ...s });

    // Tell server to persist this order
    this.gameService.socket?.emit('lamiSortHand', {
      roomId: s.roomId,
      playerId: pid,
      sortedHand: hand
    });
  }
}
