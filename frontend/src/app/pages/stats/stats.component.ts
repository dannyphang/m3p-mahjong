import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent {
  private router = inject(Router);
  public authService = inject(AuthService);

  goHome() {
    this.router.navigate(['/']);
  }

  getWinRate(wins: number, played: number): string {
    if (!played || played === 0) return '0%';
    return Math.round((wins / played) * 100) + '%';
  }

  getGameOutRate(clearWins: number, totalWins: number): string {
    if (!totalWins || totalWins === 0) return '0%';
    return Math.round((clearWins / totalWins) * 100) + '%';
  }

  getAverageDeadwoodPoints(points: number, games: number): number {
    if (!games || games === 0) return 0;
    return Math.round(points / games);
  }

  getAverageFan(fan: number, wins: number): number {
    if (!wins || wins === 0) return 0;
    return Number((fan / wins).toFixed(1));
  }

  getNetCoins(gained: number, lost: number): number {
    return (gained || 0) - (lost || 0);
  }

  getAverageCoins(gained: number, lost: number, played: number): number {
    if (!played || played === 0) return 0;
    return Math.round(this.getNetCoins(gained, lost) / played);
  }

  getWinTypeSplit(selfPick: number, discard: number): string {
    const sp = selfPick || 0;
    const d = discard || 0;
    const total = sp + d;
    if (total === 0) return '0% / 0%';
    const spRate = Math.round((sp / total) * 100);
    const dRate = Math.round((d / total) * 100);
    return `${spRate}% / ${dRate}%`;
  }
}
