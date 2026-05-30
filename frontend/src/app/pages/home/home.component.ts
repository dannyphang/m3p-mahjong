import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { Router } from '@angular/router';
import { TRANSLATIONS } from '../../i18n';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  gameService = inject(GameService);
  router = inject(Router);

  constructor() {
    effect(() => {
      if (this.gameService.isJoined()) {
        this.router.navigate(['/room']);
      }
    });
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

  t(key: string): string {
    const lang = this.gameService.currentLanguage();
    return TRANSLATIONS[lang as keyof typeof TRANSLATIONS]?.[key] || key;
  }
}
