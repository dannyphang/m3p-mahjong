import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [style.width.px]="scaledWidth" [style.height.px]="scaledHeight" style="display: inline-block; position: relative;">
      <div [ngClass]="small ? 'mj-tile-small' : 'mj-tile'" 
           [class.back]="isBack" 
           [style.background]="isBack ? 'var(--tile-bg-back)' : ''"
           [style.transform]="'scale(' + scale + ')'"
           style="transform-origin: top left; margin: 0; position: absolute;">
        @if (!isBack) {
          <img [src]="imageUrl" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />
        }
      </div>
    </div>
  `
})
export class TileComponent {
  @Input() type!: string;
  @Input() value!: string;
  @Input() small: boolean = false;
  @Input() isBack: boolean = false;
  @Input() scale: number = 1;

  get scaledWidth(): number {
    return (this.small ? 28 : 54) * this.scale;
  }

  get scaledHeight(): number {
    return (this.small ? 38 : 72) * this.scale;
  }

  get imageUrl(): string {
    if (this.isBack) return '';
    if (this.type === 'circle') return `/assets/images/mahjong/circle_${this.value}.png`;
    if (this.type === 'fly') return '/assets/images/mahjong/joker.png';
    
    if (this.type === 'honor') {
      const honorMap: { [key: string]: string } = {
        '东': 'east.png', '南': 'south.png', '西': 'west.png', '北': 'north.png',
        '中': 'red.png', '发': 'green.png', '白': 'white.png'
      };
      return `/assets/images/mahjong/${honorMap[this.value]}`;
    }
    if (this.type === 'flower') {
      const flowerMap: { [key: string]: string } = {
        '春': 'spring.png', '夏': 'summer.png', '秋': 'autumn.png', '冬': 'winter.png',
        '梅': 'plum.png', '兰': 'orchid.png', '竹': 'bamboo.png', '菊': 'chrysanthemum.png'
      };
      return `/assets/images/mahjong/${flowerMap[this.value]}`;
    }
    if (this.type === 'animal') {
      const animalMap: { [key: string]: string } = {
        '猫': 'cat.png', '老鼠': 'rat.png', '公鸡': 'rooster.png', '蜈蚣': 'centipede.png'
      };
      return `/assets/images/mahjong/${animalMap[this.value]}`;
    }
    return '';
  }
}
