import { Component, inject, OnInit, OnDestroy, computed, signal, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { GameService, Player } from '../../services/game.service';
import { LamiTileComponent } from '../../components/lami-tile/lami-tile.component';
import { FormsModule } from '@angular/forms';
import { TRANSLATIONS } from '../../i18n';
import { canConnectMeld } from '../../utils/lami-validator';

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

    effect(() => {
      const state = this.gameStateSignal();
      const myId = this.playerIdSignal();
      if (!state || !state.hands || !state.hands[myId]) {
        this.myHand.set([]);
        return;
      }
      
      const serverHand = state.hands[myId];
      
      this.myHand.update(currentLocal => {
        // Keep tiles from local hand that still exist in the server hand
        const newLocalHand = currentLocal.filter((t: any) => serverHand.some((st: any) => st.id === t.id));
        
        // Append any new tiles from the server hand that are not in our local hand
        serverHand.forEach((st: any) => {
          if (!newLocalHand.some((t: any) => t.id === st.id)) {
            newLocalHand.push(st);
          }
        });
        
        return newLocalHand;
      });
    }, { allowSignalWrites: true });
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

  isConnectDisabled(meld: any, position: 'start' | 'end'): boolean {
    if (this.selectedTiles.length === 0 || this.state?.status !== 'PLAYING') return true;
    if (this.state?.players[this.state?.currentTurn]?.id !== this.myId) return true;
    
    return !canConnectMeld(meld, this.selectedTiles, position, this.state?.publicMelds || []);
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

  updateRate(type: 'win' | 'joker' | 'ace', amount: number) {
    if (this.state?.players[0]?.id !== this.myId) return;
    const currentRates = this.state?.rates || { win: 20, joker: 10, ace: 5 };
    const newRate = Math.max(1, (currentRates[type] || 1) + amount);
    this.gameService.updateLamiRates({ [type]: newRate });
  }

  myHand = signal<any[]>([]);

  onCdkDrop(event: CdkDragDrop<any[]>) {
    const hand = [...this.myHand()];
    if (!hand || event.previousIndex === event.currentIndex) return;

    if (event.previousContainer === event.container) {
      moveItemInArray(hand, event.previousIndex, event.currentIndex);
      this.myHand.set(hand);
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

  titleService = inject(Title);

  ngOnInit() {
    this.titleService.setTitle('Lami | M3P Mahjong');
    this.route.queryParams.subscribe(params => {
      const name = params['name'] || 'Player';
      const roomId = params['id'] || Math.random().toString(36).substr(2, 6);
      this.gameService.playerName.set(name);
      this.gameService.roomId.set(roomId);
      this.gameService.connectAndJoin('lami');
      
      this.gameService.socket?.on('kickedFromRoom', () => {
        alert('You have been removed from the lobby by the host.');
        this.router.navigate(['/']);
      });
    });
  }



  ngOnDestroy() {
    this.gameService.disconnect();
  }

  quitRoom() {
    if (confirm('Are you sure you want to quit the room?')) {
      this.gameService.disconnect();
      this.router.navigate(['/']);
    }
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
    const nonJokers = tiles.filter(t => t.type !== 'joker');
    const jokers = tiles.filter(t => t.type === 'joker');
    
    if (nonJokers.length === 0) {
      if (jokers.length >= 3) return [tiles];
      return [];
    }

    const options: any[][] = [];

    // 1. Check if it can be a SET
    const firstVal = nonJokers[0].value;
    const isSet = nonJokers.every(t => t.value === firstVal);
    if (isSet && tiles.length >= 3) {
      // One option for Set
      options.push([...nonJokers, ...jokers]);
    }

    // 2. Check if it can be a STRAIGHT FLUSH
    const suit = nonJokers[0].suit;
    const isSameSuit = nonJokers.every(t => t.suit === suit);
    
    if (isSameSuit) {
      const normalSorted = [...nonJokers].sort((a, b) => a.value - b.value);
      this.addStraightOptions(normalSorted, jokers, options, false);

      if (nonJokers.some(t => t.value === 1)) {
        const a14Sorted = [...nonJokers].map(t => ({...t, value: t.value === 1 ? 14 : t.value})).sort((a, b) => a.value - b.value);
        this.addStraightOptions(a14Sorted, jokers, options, true);
      } else if (nonJokers.some(t => t.value >= 10)) {
        // High cards without an explicit Ace could still connect to an Ace via a Joker
        this.addStraightOptions(normalSorted, jokers, options, true);
      }
    }
    
    // Remove duplicates
    const uniqueOptions: any[][] = [];
    const seen = new Set<string>();
    for (const opt of options) {
      const key = opt.map(t => t.id).join(',');
      if (!seen.has(key)) {
        seen.add(key);
        uniqueOptions.push(opt);
      }
    }

    return uniqueOptions;
  }

  addStraightOptions(sortedNonJokers: any[], jokers: any[], options: any[][], isA14: boolean) {
    let gaps = 0;
    for(let i=0; i<sortedNonJokers.length - 1; i++) {
      const diff = sortedNonJokers[i+1].value - sortedNonJokers[i].value;
      if (diff === 0) return;
      gaps += (diff - 1);
    }
    
    if (gaps > jokers.length) return;

    const core: any[] = [];
    let expected = sortedNonJokers[0].value;
    let nonJokerIdx = 0;
    let usedJokers = 0;
    
    while(nonJokerIdx < sortedNonJokers.length) {
      if (sortedNonJokers[nonJokerIdx].value === expected) {
        core.push(sortedNonJokers[nonJokerIdx]);
        nonJokerIdx++;
      } else {
        core.push(jokers[usedJokers]);
        usedJokers++;
      }
      expected++;
    }
    
    const remainingJokers = jokers.length - usedJokers;
    if (remainingJokers < 0) return;

    const unusedJokersList = jokers.slice(usedJokers);
    const firstVal = sortedNonJokers[0].value;
    const coreLastVal = expected - 1;
    
    for(let left=0; left <= remainingJokers; left++) {
      const right = remainingJokers - left;
      
      if (firstVal - left < 1) continue; // cannot go below A(1)
      if (coreLastVal + right > 14) continue; // cannot go above A(14)
      if (!isA14 && coreLastVal + right > 13) continue; // if A is 1, max is K(13)

      const leftPart = unusedJokersList.slice(0, left);
      const rightPart = unusedJokersList.slice(left);
      
      const result = [...leftPart, ...core, ...rightPart].map(t => {
         if (t.type !== 'joker' && t.value === 14) {
             return { ...t, value: 1 };
         }
         return t;
      });

      options.push(result);
    }
  }

  playMeld() {
    const options = this.getStraightFlushOptions(this.selectedTiles);
    if (options.length > 1) {
      this.meldOptions = options;
      this.showMeldOptions = true;
    } else if (options.length === 1) {
      this.sendMeld(options[0]);
    } else {
      // In case it's somehow invalid or options is empty, though UI usually disables the button
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

  getDisplayMeldTiles(tiles: any[]) {
    if (!tiles || tiles.length <= 4) {
      return tiles;
    }
    const firstTwo = tiles.slice(0, 2);
    const lastTwo = tiles.slice(tiles.length - 2);
    const hiddenCount = tiles.length - 4;
    
    return [
      ...firstTwo,
      { isHiddenStack: true, count: hiddenCount, id: 'hidden-' + (tiles[0]?.id || Math.random()) },
      ...lastTwo
    ];
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

  kickPlayer(playerId: string) {
    this.gameService.socket?.emit('kickPlayer', {
      roomId: this.state?.roomId,
      playerId: playerId
    });
  }

  sortHand() {
    const hand = [...this.myHand()];
    if (!hand || hand.length === 0) return;
    
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

    // Update the local hand state
    this.myHand.set(hand);
  }
}
