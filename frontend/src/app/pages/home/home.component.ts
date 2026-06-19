import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { Router } from '@angular/router';
import { TRANSLATIONS } from '../../i18n';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  gameService = inject(GameService);
  router = inject(Router);
  titleService = inject(Title);

  constructor() {
    effect(() => {
      if (this.gameService.isJoined()) {
        this.router.navigate(['/room']);
      }
    });
  }

  ngOnInit() {
    this.titleService.setTitle('M3P Mahjong');
  }

  get playerName() {
    return this.gameService.playerName();
  }

  set playerName(value: string) {
    this.gameService.playerName.set(value);
  }

  get roomId() {
    return this.gameService.roomId();
  }

  set roomId(value: string) {
    this.gameService.roomId.set(value);
  }

  joinRoom() {
    this.gameService.connectAndJoin();
  }

  navigateToLamiLobby() {
    this.router.navigate(['/lami-lobby']);
  }

  t(key: string): string {
    const lang = this.gameService.currentLanguage();
    return TRANSLATIONS[lang as keyof typeof TRANSLATIONS]?.[key] || key;
  }
}
