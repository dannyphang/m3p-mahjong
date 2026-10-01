import { Component, inject, OnInit, OnDestroy, computed, signal, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FormsModule } from '@angular/forms';
import { TRANSLATIONS } from '../../i18n';

@Component({
  selector: 'app-poker-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './poker-room.component.html',
  styleUrls: ['./poker-room.component.css']
})
export class PokerRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  route = inject(ActivatedRoute);
  router = inject(Router);
  gameService = inject(GameService);
  titleService = inject(Title);

  @ViewChild('logsContainer') private logsContainer!: ElementRef;

  selectedBotDifficulty: 'easy' | 'normal' | 'hard' = 'normal';
  customRaiseAmount: number = 40;
  showGameOver = false;
  viewingTable = signal<boolean>(false);

  constructor() {
    effect(() => {
      const logsCount = this.gameService.gameState()?.logs?.length || 0;
      setTimeout(() => this.scrollToBottom(), 50);
    });

    effect(() => {
      const state = this.gameStateSignal();
      if (state && (state.status === 'SHOWDOWN' || state.status === 'GAME_OVER')) {
        this.showGameOver = true;
      } else {
        this.showGameOver = false;
        this.viewingTable.set(false);
      }

      // Sync custom raise amount default to minRaise
      if (state && state.currentBet !== undefined) {
        const minTarget = state.currentBet + (state.minRaise || state.settings?.bigBlind || 20);
        if (this.customRaiseAmount < minTarget) {
          this.customRaiseAmount = minTarget;
        }
      }
    });
  }

  toggleViewTable() {
    this.viewingTable.update(v => !v);
  }

  gameStateSignal = this.gameService.gameState;
  playerIdSignal = this.gameService.myPlayerId;

  get state(): any {
    return this.gameStateSignal();
  }

  get myId() {
    return this.playerIdSignal();
  }

  get roomId() {
    return this.gameService.roomId();
  }

  get myPlayer(): any {
    return this.state?.players?.find((p: any) => p.id === this.myId);
  }

  get myHand() {
    return this.state?.hands?.[this.myId] || [];
  }

  get isHost() {
    const players = this.state?.players;
    return !!players && players.length > 0 && players[0].id === this.myId;
  }

  get isAllReady() {
    const players = this.state?.players;
    return !!players && players.length >= 2 && players.every((p: any) => p.isReady);
  }

  get isMyTurn() {
    if (!this.state || this.state.status !== 'BETTING' || !this.state.players) return false;
    const curP = this.state.players[this.state.currentTurn];
    return curP?.id === this.myId;
  }

  get toCall(): number {
    if (!this.state) return 0;
    const currentBet = this.state.currentBet || 0;
    const myCurrentBet = this.state.roundBets?.[this.myId] || 0;
    return Math.max(0, currentBet - myCurrentBet);
  }

  get canCheck(): boolean {
    return this.toCall === 0;
  }

  get minRaiseTarget(): number {
    if (!this.state) return 20;
    return (this.state.currentBet || 0) + (this.state.minRaise || this.state.settings?.bigBlind || 20);
  }

  get myHandEvaluation() {
    return this.state?.handEvaluations?.[this.myId];
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  ngOnInit() {
    this.titleService.setTitle("Texas Hold'em Poker | Table");
    this.route.queryParams.subscribe(params => {
      const roomId = params['id'];
      const name = params['name'];
      if (roomId && name) {
        this.gameService.roomId.set(roomId);
        this.gameService.playerName.set(name);
        this.gameService.connectAndJoin('poker');
      } else {
        this.router.navigate(['/poker-lobby']);
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
        str = str.replace(`{${k}}`, String(params[k]));
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

  getSuitSymbol(suit: string | undefined): string {
    if (!suit) return '';
    const symbols: Record<string, string> = { hearts: '♥', spades: '♠', clubs: '♣', diamonds: '♦' };
    return symbols[suit] || '';
  }

  getOpponents() {
    const s = this.state;
    if (!s || !s.players) return [];
    const myIdx = s.players.findIndex((p: any) => p.id === this.myId);
    if (myIdx === -1) return [];

    const opponents = [];
    const numPlayers = s.players.length;
    for (let i = 1; i < numPlayers; i++) {
      const idx = (myIdx + i) % numPlayers;
      const opp = s.players[idx];
      if (opp) {
        opponents.push({
          ...opp,
          seatIndex: idx,
          isTurn: s.currentTurn === idx && s.status === 'BETTING',
          isDealer: s.dealerIndex === idx,
          cards: s.hands[opp.id] || [],
          roundBet: s.roundBets[opp.id] || 0,
          handEval: s.handEvaluations?.[opp.id]
        });
      }
    }
    return opponents;
  }

  // Poker Actions
  sendPokerAction(action: string, amount?: number) {
    if (!this.isMyTurn) return;
    this.gameService.socket?.emit('pokerAction', {
      roomId: this.roomId,
      playerId: this.myId,
      action,
      amount
    });
  }

  fold() {
    this.sendPokerAction('fold');
  }

  checkOrCall() {
    if (this.canCheck) {
      this.sendPokerAction('check');
    } else {
      this.sendPokerAction('call');
    }
  }

  raise(amount?: number) {
    const target = amount || this.customRaiseAmount;
    this.sendPokerAction('raise', target);
  }

  allIn() {
    this.sendPokerAction('allIn');
  }

  setQuickBet(fraction: number | string) {
    if (!this.state || !this.myPlayer) return;
    const currentBet = this.state.currentBet || 0;
    const pot = this.state.pot || 0;
    const myChips = this.myPlayer.coins || 0;
    const minTarget = this.minRaiseTarget;

    let target = minTarget;
    if (fraction === 'min') {
      target = minTarget;
    } else if (fraction === '2bb') {
      target = currentBet + (this.state.settings?.bigBlind || 20) * 2;
    } else if (fraction === 'halfPot') {
      target = currentBet + Math.max(minTarget - currentBet, Math.floor(pot * 0.5));
    } else if (fraction === 'pot') {
      target = currentBet + Math.max(minTarget - currentBet, pot);
    } else if (fraction === 'allIn') {
      target = (this.state.roundBets?.[this.myId] || 0) + myChips;
    }

    const myCurrentBet = this.state.roundBets?.[this.myId] || 0;
    const maxAffordable = myCurrentBet + myChips;
    this.customRaiseAmount = Math.min(maxAffordable, Math.max(minTarget, target));
  }

  // Lobby actions
  toggleReady() {
    this.gameService.socket?.emit('toggleReady', {
      roomId: this.roomId,
      playerId: this.myId
    });
  }

  addBot() {
    this.gameService.socket?.emit('addBot', {
      roomId: this.roomId,
      difficulty: this.selectedBotDifficulty
    });
  }

  removeBot(botId: string) {
    this.gameService.socket?.emit('removeBot', {
      roomId: this.roomId,
      botId
    });
  }

  kickPlayer(playerId: string) {
    this.gameService.socket?.emit('kickPlayer', {
      roomId: this.roomId,
      playerId
    });
  }

  updateBlinds(sb: number, bb: number) {
    this.gameService.socket?.emit('updatePokerSettings', {
      roomId: this.roomId,
      smallBlind: sb,
      bigBlind: bb
    });
  }

  startGame() {
    this.gameService.socket?.emit('startGame', {
      roomId: this.roomId
    });
  }

  restartGame() {
    this.gameService.socket?.emit('restartGame', {
      roomId: this.roomId,
      playerId: this.myId
    });
  }

  quitRoom() {
    this.router.navigate(['/poker-lobby']);
  }
}
