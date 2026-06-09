import { Component, EventEmitter, Output, Input, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TRANSLATIONS } from '../../i18n';

@Component({
  selector: 'app-lami-guide',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lobby-overlay" style="background: rgba(12, 9, 7, 0.85); z-index: 2000;" (click)="close.emit()">
      <div class="glass-card scoring-modal" style="max-width: 800px; width: 90%; max-height: 85vh; overflow-y: auto; padding: 24px; position: relative;" (click)="$event.stopPropagation()">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 class="lobby-title" style="margin: 0;">{{ t('lami.rulesTitle') }}</h2>
          <button class="btn-primary" style="padding: 8px 16px; background: #c62828; width: auto; position: sticky; top: 0;" (click)="close.emit()">{{ t('scoring.close') }} (ESC)</button>
        </div>
        
        <div class="scoring-content" style="color: #eaeaea; text-align: left; font-size: 14px;">
          
          <div style="margin-bottom: 24px;">
            <h3 style="color: var(--gold-primary); border-bottom: 1px solid var(--gold-secondary); padding-bottom: 8px; margin-bottom: 12px;">{{ t('lami.rule1.title') }}</h3>
            <p style="white-space: pre-line">{{ t('lami.rule1.desc') }}</p>
          </div>

          <div style="margin-bottom: 24px;">
            <h3 style="color: var(--gold-primary); border-bottom: 1px solid var(--gold-secondary); padding-bottom: 8px; margin-bottom: 12px;">{{ t('lami.rule2.title') }}</h3>
            <p style="white-space: pre-line">{{ t('lami.rule2.desc') }}</p>
          </div>

          <div style="margin-bottom: 24px;">
            <h3 style="color: var(--gold-primary); border-bottom: 1px solid var(--gold-secondary); padding-bottom: 8px; margin-bottom: 12px;">{{ t('lami.rule3.title') }}</h3>
            <p style="white-space: pre-line">{{ t('lami.rule3.desc') }}</p>
          </div>

          <div style="margin-bottom: 24px;">
            <h3 style="color: var(--gold-primary); border-bottom: 1px solid var(--gold-secondary); padding-bottom: 8px; margin-bottom: 12px;">{{ t('lami.rule4.title') }}</h3>
            <p style="white-space: pre-line">{{ t('lami.rule4.desc') }}</p>
          </div>
          
        </div>
      </div>
    </div>
  `
})
export class LamiGuideComponent {
  @Input() lang: 'zh' | 'en' = 'zh';
  @Output() close = new EventEmitter<void>();

  @HostListener('window:keydown.Escape')
  onEsc() {
    this.close.emit();
  }

  t(key: string): string {
    return TRANSLATIONS[this.lang]?.[key] || key;
  }
}
