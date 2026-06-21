import { Component, EventEmitter, Output, Input, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TRANSLATIONS } from '../../i18n';
import { TileComponent } from '../tile/tile.component';

@Component({
  selector: 'app-scoring-guide',
  standalone: true,
  imports: [CommonModule, TileComponent],
  template: `
    <div class="lobby-overlay" style="position: fixed; background: rgba(12, 9, 7, 0.85); z-index: 2000;" (click)="close.emit()">
      <div class="glass-card scoring-modal" style="max-width: 800px; width: 90%; max-height: 85vh; overflow-y: auto; padding: 24px; position: relative;" (click)="$event.stopPropagation(); activeTooltip = null;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 class="lobby-title" style="margin: 0;">{{ t('scoring.title') }}</h2>
          <button class="btn-primary" style="padding: 8px 16px; background: #c62828; width: auto; position: sticky; top: 0;" (click)="close.emit()">{{ t('scoring.close') }} (ESC)</button>
        </div>
        
        <div class="scoring-content" style="color: #eaeaea; text-align: left; font-size: 14px;">
          <p style="margin-bottom: 20px;">{{ t('scoring.minFan') }} <strong>5 Fan / 番</strong></p>
          
          <div *ngFor="let category of getCombos()" style="margin-bottom: 24px;">
            <h3 style="color: var(--gold-primary); border-bottom: 1px solid var(--gold-secondary); padding-bottom: 8px; margin-bottom: 12px;">{{ category.category }}</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: rgba(0,0,0,0.4);">
                  <th style="padding: 10px; text-align: left; border: 1px solid var(--glass-border); width: 35%;">{{ t('scoring.colName') }}</th>
                  <th style="padding: 10px; text-align: left; border: 1px solid var(--glass-border);">{{ t('scoring.colDesc') }}</th>
                  <th style="padding: 10px; text-align: center; border: 1px solid var(--glass-border); width: 10%;">Fan (番)</th>
                </tr>
              </thead>
              <tbody>
                <ng-container *ngFor="let item of category.items">
                  <tr class="scoring-row">
                    <td style="padding: 10px; border-left: 1px solid var(--glass-border); border-right: 1px solid var(--glass-border); font-weight: bold; color: #fff; position: relative;">
                      {{ item.name }}
                      <span *ngIf="item.pattern" 
                            style="font-size: 14px; margin-left: 8px; cursor: pointer; display: inline-block; background: rgba(255,215,0,0.2); border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px;" 
                            (click)="toggleTooltip(item.name); $event.stopPropagation()">ℹ️</span>
                    </td>
                    <td style="padding: 10px; border-right: 1px solid var(--glass-border); color: #ccc;">{{ item.desc }}</td>
                    <td style="padding: 10px; border-right: 1px solid var(--glass-border); text-align: center; font-weight: bold; color: var(--gold-primary);">{{ item.fan }}</td>
                  </tr>
                  <!-- Expanded Tooltip Row -->
                  <tr *ngIf="activeTooltip === item.name" class="combo-popup" style="background: rgba(20, 20, 25, 0.95); border-left: 1px solid var(--glass-border); border-right: 1px solid var(--glass-border); box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
                    <td colspan="3" style="padding: 16px; text-align: center;">
                      <div style="color: var(--gold-primary); font-weight: bold; margin-bottom: 12px; letter-spacing: 1px;">{{ item.name }} {{ t('scoring.example') }}</div>
                      <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; align-items: center;">
                        <app-tile *ngFor="let tile of item.pattern" [type]="parseTile(tile).type" [value]="parseTile(tile).value" [scale]="0.7"></app-tile>
                      </div>
                    </td>
                  </tr>
                </ng-container>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .scoring-row {
      border-bottom: 1px solid rgba(255,255,255,0.1);
      transition: background 0.2s;
    }
    .scoring-row:hover {
      background: rgba(255, 215, 0, 0.1) !important;
    }
    .combo-popup {
      animation: expandDown 0.3s cubic-bezier(0.175, 0.885, 0.32, 1);
    }
    @keyframes expandDown {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class ScoringGuideComponent {
  @Input() lang: 'zh' | 'en' = 'zh';
  @Output() close = new EventEmitter<void>();

  activeTooltip: string | null = null;

  @HostListener('window:keydown.Escape')
  onEsc() {
    this.close.emit();
  }

  t(key: string): string {
    return TRANSLATIONS[this.lang]?.[key] || key;
  }

  toggleTooltip(name: string) {
    if (this.activeTooltip === name) {
      this.activeTooltip = null;
    } else {
      this.activeTooltip = name;
    }
  }

  parseTile(tString: string) {
    const parts = tString.split('_');
    return { type: parts[0], value: parts[1] };
  }
  
  getCombos() {
    const isEn = this.lang === 'en';
    return [
      { category: isEn ? 'Limit Hands (10 Fan)' : '满胡/爆满 (10番)', items: [
        { name: isEn ? 'Heavenly Hand' : '天胡', desc: isEn ? 'Dealer wins on the first draw.' : '庄家开局摸牌直接胡牌。', fan: '10' },
        { name: isEn ? 'Earthly Hand' : '地胡', desc: isEn ? 'Non-dealer wins on their very first draw.' : '闲家在第一轮摸牌直接胡牌。', fan: '10' },
        { name: isEn ? 'Four Jokers' : '四飞', desc: isEn ? 'Winning with all 4 Joker tiles in hand.' : '手牌集齐4张飞（Joker）胡牌。', fan: '10', pattern: ['fly_飞', 'fly_飞', 'fly_飞', 'fly_飞'] },
        { name: isEn ? 'Great Four Winds' : '大四喜', desc: isEn ? 'Hand contains Pongs/Kongs of all 4 Winds.' : '手牌包含东、南、西、北四种风牌的碰或杠。', fan: '10', pattern: ['honor_东', 'honor_东', 'honor_东', 'honor_南', 'honor_南', 'honor_南', 'honor_西', 'honor_西', 'honor_西', 'honor_北', 'honor_北', 'honor_北', 'honor_中', 'honor_中'] },
        { name: isEn ? 'Little Four Winds' : '小四喜', desc: isEn ? 'Pongs/Kongs of 3 Winds, and a pair of the 4th.' : '手牌包含三种风牌的碰/杠，以及第四种风牌的对子。', fan: '10', pattern: ['honor_东', 'honor_东', 'honor_东', 'honor_南', 'honor_南', 'honor_南', 'honor_西', 'honor_西', 'honor_西', 'honor_北', 'honor_北', 'circle_1', 'circle_2', 'circle_3'] },
        { name: isEn ? 'Great Three Dragons' : '大三元', desc: isEn ? 'Pongs/Kongs of all 3 Dragons.' : '手牌包含中、发、白三种箭牌的碰或杠。', fan: '10', pattern: ['honor_中', 'honor_中', 'honor_中', 'honor_发', 'honor_发', 'honor_发', 'honor_白', 'honor_白', 'honor_白', 'circle_1', 'circle_2', 'circle_3', 'honor_东', 'honor_东'] },
        { name: isEn ? 'All Honors' : '字一色', desc: isEn ? 'Hand consists entirely of Wind and Dragon tiles.' : '手牌全由风牌或箭牌组成（没有筒子）。', fan: '10', pattern: ['honor_东', 'honor_东', 'honor_东', 'honor_中', 'honor_中', 'honor_中', 'honor_发', 'honor_发', 'honor_发', 'honor_北', 'honor_北', 'honor_北', 'honor_白', 'honor_白'] },
        { name: isEn ? 'Hidden Treasure' : '坎坎胡', desc: isEn ? 'Winning with 4 concealed Pongs/Kongs.' : '手牌包含四个暗刻（没有碰、明杠别人的牌）。', fan: '10' },
        { name: isEn ? 'Seven Pairs' : '七星对子', desc: isEn ? 'Hand consists of exactly 7 pairs.' : '手牌由七个不同的对子组成。', fan: '10', pattern: ['honor_东', 'honor_东', 'honor_南', 'honor_南', 'honor_西', 'honor_西', 'honor_北', 'honor_北', 'honor_中', 'honor_中', 'honor_发', 'honor_发', 'honor_白', 'honor_白'] },
        { name: isEn ? 'Eighteen Arhats' : '十八罗汉', desc: isEn ? 'Winning with 4 Kongs (18 tiles total).' : '手牌包含四个杠牌（总共18张牌）。', fan: '10' },
        { name: isEn ? 'No Flowers' : '邋遢胡', desc: isEn ? 'Winning without drawing any Flowers, Animals, or Jokers.' : '胡牌时没有任何花牌、动物牌或飞（Joker）。', fan: '10' }
      ]},
      { category: isEn ? 'Medium Hands (2-3 Fan)' : '中等胡牌 (2-3番)', items: [
        { name: isEn ? 'Little Three Dragons' : '小三元', desc: isEn ? 'Pongs/Kongs of 2 Dragons and a pair of the 3rd.' : '包含两种箭牌的碰/杠，以及第三种箭牌的对子。', fan: '3', pattern: ['honor_中', 'honor_中', 'honor_中', 'honor_发', 'honor_发', 'honor_发', 'honor_白', 'honor_白', 'circle_1', 'circle_2', 'circle_3', 'circle_4', 'circle_5', 'circle_6'] },
        { name: isEn ? 'All Seasons/Gentlemen' : '全套四季 / 四君子', desc: isEn ? 'Collecting all 4 Seasons or all 4 Gentlemen.' : '集齐春夏秋冬或者梅兰竹菊四张花牌。', fan: '3', pattern: ['flower_春', 'flower_夏', 'flower_秋', 'flower_冬'] },
        { name: isEn ? 'All Circle' : '清一色 / 全筒子', desc: isEn ? 'Hand consists entirely of Circle tiles.' : '手牌全由筒子组成（没有字牌）。', fan: '2', pattern: ['circle_1', 'circle_2', 'circle_3', 'circle_4', 'circle_5', 'circle_6', 'circle_7', 'circle_8', 'circle_9', 'circle_7', 'circle_8', 'circle_9', 'circle_1', 'circle_1'] },
        { name: isEn ? 'Pong-Pong Hand' : '碰碰胡', desc: isEn ? 'Hand consists of 4 Pongs/Kongs and 1 Pair.' : '手牌包含四个碰/杠和一个对子。', fan: '2', pattern: ['honor_东', 'honor_东', 'honor_东', 'honor_南', 'honor_南', 'honor_南', 'circle_2', 'circle_2', 'circle_2', 'circle_8', 'circle_8', 'circle_8', 'honor_中', 'honor_中'] }
      ]},
      { category: isEn ? 'Basic Hands & Bonuses (1 Fan)' : '基础胡牌与附加番 (1番)', items: [
        { name: isEn ? 'Ping Hu' : '平胡', desc: isEn ? 'Hand consists entirely of Chows (sequences).' : '手牌全由顺子（吃）和一个非番子的对子组成。', fan: '1', pattern: ['circle_1', 'circle_2', 'circle_3', 'circle_4', 'circle_5', 'circle_6', 'circle_2', 'circle_3', 'circle_4', 'circle_7', 'circle_8', 'circle_9', 'circle_5', 'circle_5'] },
        { name: isEn ? 'Robbing the Kong' : '抢杠', desc: isEn ? "Winning by claiming an opponent's Kong tile." : '当别人明杠时，用那张牌胡牌。', fan: '1' },
        { name: isEn ? 'Win on Kong' : '杠上开花', desc: isEn ? 'Winning on the replacement tile drawn after a Kong.' : '杠牌后摸补牌胡牌。', fan: '1' },
        { name: isEn ? 'Win on Flower' : '花上/飞上开花', desc: isEn ? 'Winning on the replacement tile drawn after a Flower/Joker.' : '摸到花牌或飞后，摸补牌胡牌。', fan: '1' },
        { name: isEn ? 'Seat/Round Wind' : '匹配风牌', desc: isEn ? 'Pong/Kong of your Seat Wind or Round Wind.' : '拥有本局圈风或自己门风的碰/杠。', fan: '1', pattern: ['honor_东', 'honor_东', 'honor_东'] },
        { name: isEn ? 'Dragon Pong' : '三元牌', desc: isEn ? 'Pong/Kong of any Dragon (Red, Green, White).' : '拥有中、发、白的碰/杠。', fan: '1', pattern: ['honor_中', 'honor_中', 'honor_中'] },
        { name: isEn ? 'Animal Tile' : '动物牌', desc: isEn ? 'Each Animal tile drawn.' : '每张动物牌（猫鼠鸡蚣）。', fan: '1', pattern: ['animal_猫'] },
        { name: isEn ? 'Flower Tile' : '花牌', desc: isEn ? 'Each matching Flower tile (2 Fan if matches seat).' : '每张花牌。如果花色与座位匹配则计2番。', fan: '1-2', pattern: ['flower_春'] },
        { name: isEn ? 'Exposed Joker' : '已炖飞牌', desc: isEn ? 'Each Joker (Fly) exposed before winning.' : '胡牌前打出的每一张飞。', fan: '1', pattern: ['fly_飞'] }
      ]}
    ];
  }
}
