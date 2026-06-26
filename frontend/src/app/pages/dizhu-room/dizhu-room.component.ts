import { Component, inject, OnInit, OnDestroy, computed, signal, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { GameService } from '../../services/game.service';
import { FormsModule } from '@angular/forms';
import { TRANSLATIONS } from '../../i18n';

@Component({
  selector: 'app-dizhu-room',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './dizhu-room.component.html',
  styleUrls: ['./dizhu-room.component.css']
})
export class DizhuRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  route = inject(ActivatedRoute);
  router = inject(Router);
  gameService = inject(GameService);
  titleService = inject(Title);

  @ViewChild('logsContainer') private logsContainer!: ElementRef;

  selectedCards = signal<any[]>([]);
  showGameOver = false;
  myHand = signal<any[]>([]);
  selectedBotDifficulty: 'easy' | 'normal' | 'hard' = 'normal';

  constructor() {
    effect(() => {
      const logsCount = this.gameService.gameState()?.logs?.length || 0;
      setTimeout(() => this.scrollToBottom(), 50);
    });

    effect(() => {
      const state = this.gameStateSignal();
      const myId = this.playerIdSignal();
      if (!state || !state.hands || !state.hands[myId]) {
        this.myHand.set([]);
        return;
      }
      
      const serverHand = state.hands[myId];
      
      this.myHand.update(currentLocal => {
        // Keep cards from local hand that still exist in the server hand
        const newLocalHand = currentLocal.filter((c: any) => serverHand.some((sc: any) => sc.id === c.id));
        
        // Append any new cards from the server hand that are not in our local hand
        serverHand.forEach((sc: any) => {
          if (!newLocalHand.some((c: any) => c.id === sc.id)) {
            newLocalHand.push(sc);
          }
        });
        
        return newLocalHand;
      });
    }, { allowSignalWrites: true });
  }

  gameStateSignal = this.gameService.gameState;
  playerIdSignal = this.gameService.myPlayerId;

  get state() {
    const s = this.gameStateSignal();
    if (s && s.status === 'GAME_OVER') {
      this.showGameOver = true;
    } else {
      this.showGameOver = false;
    }
    return s;
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  get myId() {
    return this.playerIdSignal();
  }

  get roomId() {
    return this.gameService.roomId();
  }

  get myPlayer() {
    return this.state?.players?.find((p: any) => p.id === this.myId);
  }

  get isHost() {
    const players = this.state?.players;
    return !!players && players.length > 0 && players[0].id === this.myId;
  }

  get isAllReady() {
    const players = this.state?.players;
    return !!players && players.length === 3 && players.every((p: any) => p.isReady);
  }

  get isMyTurn() {
    if (!this.state || this.state.players.length === 0) return false;
    const turnIndex = this.state.currentTurn;
    return this.state.players[turnIndex]?.id === this.myId;
  }

  ngOnInit() {
    this.titleService.setTitle('Room | Dou Dizhu');
    this.route.queryParams.subscribe(params => {
      const roomId = params['id'];
      const name = params['name'];
      if (roomId && name) {
        this.gameService.roomId.set(roomId);
        this.gameService.playerName.set(name);
        this.gameService.connectAndJoin('dizhu');
      } else {
        this.router.navigate(['/dizhu-lobby']);
      }
    });
  }

  ngOnDestroy() {
    this.gameService.disconnect();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.logsContainer && this.logsContainer.nativeElement) {
        this.logsContainer.nativeElement.scrollTop = this.logsContainer.nativeElement.scrollHeight;
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

  toggleCardSelection(card: any) {
    if (this.state?.status !== 'PLAYING') return;
    const currentSelected = [...this.selectedCards()];
    const idx = currentSelected.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      currentSelected.splice(idx, 1);
    } else {
      currentSelected.push(card);
    }
    this.selectedCards.set(currentSelected);
  }

  isCardSelected(card: any): boolean {
    return this.selectedCards().some(c => c.id === card.id);
  }

  clearSelection() {
    this.selectedCards.set([]);
  }

  // Socket triggers
  toggleReady() {
    this.gameService.socket?.emit('toggleReady', { roomId: this.roomId, playerId: this.myId });
  }

  addBot() {
    this.gameService.socket?.emit('addBot', { roomId: this.roomId, difficulty: this.selectedBotDifficulty });
  }

  removeBot(botId: string) {
    this.gameService.socket?.emit('removeBot', { roomId: this.roomId, botId });
  }

  kickPlayer(playerId: string) {
    this.gameService.socket?.emit('kickPlayer', { roomId: this.roomId, playerId });
  }

  startGame() {
    this.gameService.socket?.emit('startGame', { roomId: this.roomId });
  }

  changeGameMode(mode: 'classic' | 'laizi') {
    this.gameService.socket?.emit('updateDizhuSettings', { roomId: this.roomId, mode });
  }

  get wildcardDisplay(): string {
    const rank = this.state?.wildcardRank;
    if (!rank) return '';
    const displays: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    return displays[rank] || String(rank);
  }

  restartGame() {
    this.gameService.socket?.emit('restartGame', { roomId: this.roomId, playerId: this.myId });
    this.clearSelection();
  }

  quitRoom() {
    this.router.navigate(['/dizhu-lobby']);
  }

  bid(value: number) {
    this.gameService.socket?.emit('dizhuBid', { roomId: this.roomId, playerId: this.myId, bidValue: value });
  }

  playCards() {
    const selected = this.selectedCards();
    if (selected.length === 0) return;
    this.gameService.socket?.emit('dizhuPlayCards', { roomId: this.roomId, playerId: this.myId, cards: selected });
    this.clearSelection();
  }

  pass() {
    this.gameService.socket?.emit('dizhuPass', { roomId: this.roomId, playerId: this.myId });
    this.clearSelection();
  }

  getPlayerName(playerId: string): string {
    if (playerId === this.myId) {
      return this.t('lobby.you');
    }
    const p = this.state?.players?.find((x: any) => x.id === playerId);
    return p ? p.name : playerId;
  }

  getSuitSymbol(suit: string | undefined): string {
    if (!suit) return '';
    const symbols: Record<string, string> = { hearts: '♥', spades: '♠', clubs: '♣', diamonds: '♦', joker: '☺' };
    return symbols[suit] || '';
  }

  isWildcard(card: any): boolean {
    if (!card) return false;
    if (card.isWildcard) return true;
    return !!this.state?.wildcardRank && card.rank === this.state.wildcardRank;
  }

  getOpponents() {
    const s = this.state;
    if (!s || !s.players) return [];
    const myIdx = s.players.findIndex(p => p.id === this.myId);
    if (myIdx === -1) return [];

    const opponents = [];
    // 3 players total: index (myIdx+1)%3 is right, (myIdx+2)%3 is left
    const positions = ['right', 'left'];
    for (let i = 1; i <= 2; i++) {
      const idx = (myIdx + i) % 3;
      if (s.players[idx]) {
        opponents.push({
          ...s.players[idx],
          position: positions[i - 1],
          cardCount: s.hands[s.players[idx].id]?.length || 0,
          isTurn: s.currentTurn === idx,
          isLandlord: s.landlordId === s.players[idx].id
        });
      }
    }
    return opponents;
  }

  onCdkDrop(event: CdkDragDrop<any[]>) {
    const hand = [...this.myHand()];
    if (!hand || event.previousIndex === event.currentIndex) return;

    moveItemInArray(hand, event.previousIndex, event.currentIndex);
    this.myHand.set(hand);
  }

  sortHand() {
    const sorted = [...this.myHand()].sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return a.suit.localeCompare(b.suit);
    });
    this.myHand.set(sorted);
  }

  get currentAnimation() {
    return this.gameService.currentAnimation();
  }

  getAnimationPosition(animPlayerId: string): string {
    if (animPlayerId === this.myId) return 'pos-bottom';
    const opponents = this.getOpponents();
    // Index 0 is right, Index 1 is left
    const rightOpp = opponents[0];
    if (rightOpp && rightOpp.id === animPlayerId) return 'pos-right';
    const leftOpp = opponents[1];
    if (leftOpp && leftOpp.id === animPlayerId) return 'pos-left';
    return 'pos-bottom';
  }
}
