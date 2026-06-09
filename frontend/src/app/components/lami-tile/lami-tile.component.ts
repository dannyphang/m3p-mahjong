import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-lami-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lami-tile" [ngClass]="['color-' + color]" [class.small]="small" [class.back]="isBack" [class.is-new]="!!newColor || isNew" [style.outlineColor]="newColor || '#ffeb3b'">
      @if (!isBack) {
        <div class="lami-content">
          <div class="lami-number">{{ getDisplayNumber() }}</div>
          @if (number === 'Joker' || number === 'joker') {
            <div class="lami-joker-icon">★</div>
          } @else {
            <div class="lami-suit-icon" [ngSwitch]="color">
              <!-- Hearts (Red) -->
              <svg *ngSwitchCase="'red'" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <!-- Diamonds (Yellow) -->
              <svg *ngSwitchCase="'yellow'" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
                <path d="M12 2L2 12l10 10 10-10L12 2z"/>
              </svg>
              <!-- Spades (Green) -->
              <svg *ngSwitchCase="'green'" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
                <path d="M12 2C12 2 4 10 4 14C4 16.2 5.8 18 8 18C9.6 18 11 17 11.7 15.6L11 22H13L12.3 15.6C13 17 14.4 18 16 18C18.2 18 20 16.2 20 14C20 10 12 2 12 2Z"/>
              </svg>
              <!-- Clubs (Blue) -->
              <svg *ngSwitchCase="'blue'" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
                <path d="M12 11C10.3 11 9 12.3 9 14C9 15.7 10.3 17 12 17C13.7 17 15 15.7 15 14C15 12.3 13.7 11 12 11ZM12 2C10.3 2 9 3.3 9 5C9 6.7 10.3 8 12 8C13.7 8 15 6.7 15 5C15 3.3 13.7 2 12 2ZM7 6C5.3 6 4 7.3 4 9C4 10.7 5.3 12 7 12C8.7 12 10 10.7 10 9C10 7.3 8.7 6 7 6ZM17 6C15.3 6 14 7.3 14 9C14 10.7 15.3 12 17 12C18.7 12 20 10.7 20 9C20 7.3 18.7 6 17 6ZM11 22H13L12.5 16C12.5 16 12.2 16 12 16C11.8 16 11.5 16 11.5 16L11 22Z"/>
              </svg>
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./lami-tile.component.css']
})
export class LamiTileComponent {
  @Input() number: string | number = 1; // 1-10, J, Q, K, or 'Joker'
  @Input() color: 'red' | 'blue' | 'green' | 'yellow' = 'red';
  @Input() small: boolean = false;
  @Input() isBack: boolean = false;
  @Input() isNew: boolean = false;
  @Input() newColor: string | null = null;

  getDisplayNumber(): string | number {
    if (this.number === 'Joker' || this.number === 'joker') return '☺';
    if (this.number === 1 || this.number === '1') return 'A';
    if (this.number === 11) return 'J';
    if (this.number === 12) return 'Q';
    if (this.number === 13) return 'K';
    return this.number;
  }
}
