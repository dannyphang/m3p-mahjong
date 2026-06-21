import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { AudioService } from '../../services/audio.service';
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
  templateUrl: './header.component.html'
})
export class HeaderComponent {
  gameService = inject(GameService);
  audioService = inject(AudioService);
  router = inject(Router);

  showScoringGuide = false;
  showPlayground = false;
  showVolumeSlider = false;
  appVersion = APP_VERSION;

  get currentLanguage() {
    return this.gameService.currentLanguage();
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  get isMusicMuted() {
    return this.audioService.isMusicMuted;
  }

  get volume() {
    return this.audioService.volume;
  }

  onVolumeChange(event: any) {
    this.audioService.setVolume(parseFloat(event.target.value));
  }

  get gameState() {
    return this.gameService.gameState();
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

  toggleMusic() {
    this.audioService.toggleMusic();
  }

  togglePlayground() {
    if (this.router.url.includes('playground')) {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/playground']);
    }
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
}
