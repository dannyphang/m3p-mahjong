import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { Router } from '@angular/router';
import { TRANSLATIONS } from '../../i18n';
import { ScoringGuideComponent } from '../scoring-guide/scoring-guide.component';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, ScoringGuideComponent, FormsModule, RouterModule],
  templateUrl: './header.component.html'
})
export class HeaderComponent {
  gameService = inject(GameService);
  router = inject(Router);

  showScoringGuide = false;
  showPlayground = false;

  get currentLanguage() {
    return this.gameService.currentLanguage();
  }

  get showNarrator() {
    return this.gameService.showNarrator();
  }

  get tileBackStyle() {
    return this.gameService.tileBackStyle();
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

  onTileBackChange(event: any) {
    this.gameService.tileBackStyle.set(event.target.value);
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
}
