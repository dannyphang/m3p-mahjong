import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LamiTileComponent } from '../../components/lami-tile/lami-tile.component';
import { GameService } from '../../services/game.service';
import { TRANSLATIONS } from '../../i18n';
import { Title } from '@angular/platform-browser';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-lami-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, LamiTileComponent],
  templateUrl: './lami-lobby.component.html',
  styleUrls: ['./lami-lobby.component.css']
})
export class LamiLobbyComponent {
  private router = inject(Router);
  private gameService = inject(GameService);
  private authService = inject(AuthService);
  titleService = inject(Title);

  playerName: string = '';
  roomId: string = '';

  ngOnInit() {
    this.titleService.setTitle('Lami | M3P Mahjong');
    this.roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.playerName = this.gameService.playerName();
  }

  t(key: string): string {
    const lang = this.gameService.currentLanguage();
    return TRANSLATIONS[lang as keyof typeof TRANSLATIONS]?.[key] || key;
  }

  joinRoom() {
    if (!this.playerName.trim()) return;
    this.gameService.playerName.set(this.playerName.trim());
    this.authService.updateUserName(this.playerName.trim());
    this.router.navigate(['/lami-room'], { queryParams: { id: this.roomId, type: 'lami', name: this.playerName.trim() } });
  }

  backToMain() {
    this.router.navigate(['/']);
  }
}
