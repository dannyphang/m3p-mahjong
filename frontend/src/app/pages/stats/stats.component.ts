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
}
