import { Component, inject, NgZone, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { TRANSLATIONS } from '../../i18n';
import { ScoringGuideComponent } from '../scoring-guide/scoring-guide.component';
import { LamiGuideComponent } from '../lami-guide/lami-guide.component';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { APP_VERSION } from '../../../environments/version';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, ScoringGuideComponent, LamiGuideComponent, FormsModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  gameService = inject(GameService);
  audioService = inject(AudioService);
  authService = inject(AuthService);
  router = inject(Router);

  showScoringGuide = false;
  showPlayground = false;
  showVolumeSlider = false;
  showAccountMenu = false;
  appVersion = APP_VERSION;
  
  private lastMultiplier = 0;
  animateMultiplier = false;

  constructor() {
    effect(() => {
      const s = this.gameService.gameState();
      if (!s) {
        this.lastMultiplier = 0;
        this.animateMultiplier = false;
        return;
      }
      
      const bid = s.highestBid || 0;
      const bombs = s.bombsCount || 0;
      const current = bid * Math.pow(2, bombs);

      if (current > this.lastMultiplier) {
        if (this.lastMultiplier > 0) {
          this.animateMultiplier = true;
          setTimeout(() => {
            this.animateMultiplier = false;
          }, 1000);
        }
        this.lastMultiplier = current;
      } else if (current < this.lastMultiplier) {
        this.lastMultiplier = current;
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (this.showAccountMenu && !target.closest('.global-actions')) {
      this.showAccountMenu = false;
    }
  }

  get currentLanguage() {
    return this.gameService.currentLanguage();
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  get isBgmMuted() {
    return this.audioService.isMusicMuted;
  }

  get bgmVolume() {
    return this.audioService.bgmVolume;
  }

  onBgmVolumeChange(event: any) {
    this.audioService.setBgmVolume(parseFloat(event.target.value));
  }

  get isSfxMuted() {
    return this.audioService.isSoundEffectsMuted;
  }

  get sfxVolume() {
    return this.audioService.sfxVolume;
  }

  onSfxVolumeChange(event: any) {
    this.audioService.setSfxVolume(parseFloat(event.target.value));
  }

  get gameState() {
    return this.gameService.gameState();
  }

  /** Lami game state — available when on lami-room route */
  get lamiState() {
    const s = this.gameService.gameState();
    // gameState is set for both mahjong and lami; differentiate by URL
    return this.isLamiRoom ? s : null;
  }

  quitLami() {
    if (confirm('Are you sure you want to quit the room?')) {
      this.gameService.disconnect();
      this.router.navigate(['/']);
    }
  }

  t(key: string, params?: Record<string, any>): string {
    const lang = this.currentLanguage;
    let str = TRANSLATIONS[lang as keyof typeof TRANSLATIONS]?.[key] || key;
    if (params) {
      Object.keys(params).forEach(k => {
        str = str.replace(`{${k}}`, params[k]);
      });
    }
    return str;
  }

  toggleLanguage() {
    this.gameService.currentLanguage.set(this.currentLanguage === 'zh' ? 'en' : 'zh');
  }

  toggleNarrator() {
    this.gameService.showNarrator.set(!this.showNarrator);
  }

  toggleVolumeSlider() {
    this.showVolumeSlider = !this.showVolumeSlider;
  }

  toggleBgm() {
    this.audioService.toggleBgm();
  }

  toggleSfx() {
    this.audioService.toggleSfx();
  }

  togglePlayground() {
    if (this.router.url.includes('playground')) {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/playground']);
    }
  }

  goToStats() {
    this.router.navigate(['/stats']);
  }

  goHome() {
    this.gameService.disconnect();
    this.router.navigate(['/']);
  }

  get isPlayground() {
    return this.router.url.includes('playground');
  }

  get isLamiRoom() {
    return this.router.url.includes('lami');
  }

  get isDizhuRoom() {
    return this.router.url.includes('dizhu');
  }

  get dizhuState() {
    const s = this.gameService.gameState();
    return this.isDizhuRoom ? s : null;
  }

  get dizhuMultiplier(): number {
    const s = this.dizhuState;
    if (!s) return 0;
    const bid = s.highestBid || 0;
    const bombs = s.bombsCount || 0;
    return bid * Math.pow(2, bombs);
  }

  ngZone = inject(NgZone);

  async logout() {
    await this.authService.logout();
    this.ngZone.run(() => {
      this.router.navigate(['/login']);
    });
  }
}
