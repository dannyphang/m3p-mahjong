import { Component, EventEmitter, Output, signal, effect, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TileComponent } from '../../components/tile/tile.component';

interface Tile {
  type: string;
  value: string;
}

interface Meld {
  type: 'pong' | 'kong' | 'chow';
  tiles: Tile[];
}

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [CommonModule, FormsModule, TileComponent],
  template: `
    <div class="lobby-container" style="display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto; height: 100%; box-sizing: border-box;">
      <h1 class="lobby-title" style="margin-bottom: 20px;">Mahjong Scoring Playground</h1>
      
      <div class="glass-card" style="width: 100%; max-width: 1000px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: var(--gold-primary); margin-top: 0; margin-bottom: 16px;">Available Tiles</h2>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="tile-group" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div style="width: 100px; color: #a0a0ab; align-self: center;">Circles</div>
            @for (val of ['1','2','3','4','5','6','7','8','9']; track val) {
              <div class="pg-tile" (click)="addTile({type: 'circle', value: val})">
                <app-tile type="circle" [value]="val" [scale]="0.75"></app-tile>
              </div>
            }
          </div>
          
          <div class="tile-group" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div style="width: 100px; color: #a0a0ab; align-self: center;">Winds</div>
            @for (val of ['东','南','西','北']; track val) {
              <div class="pg-tile" (click)="addTile({type: 'honor', value: val})">
                <app-tile type="honor" [value]="val" [scale]="0.75"></app-tile>
              </div>
            }
          </div>

          <div class="tile-group" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div style="width: 100px; color: #a0a0ab; align-self: center;">Dragons</div>
            @for (val of ['中','发','白']; track val) {
              <div class="pg-tile" (click)="addTile({type: 'honor', value: val})">
                <app-tile type="honor" [value]="val" [scale]="0.75"></app-tile>
              </div>
            }
          </div>

          <div class="tile-group" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <div style="width: 100px; color: #a0a0ab; align-self: center;">Flowers & Others</div>
            @for (val of ['春','夏','秋','冬','梅','兰','菊','竹']; track val) {
              <div class="pg-tile" (click)="addTile({type: 'flower', value: val})">
                <app-tile type="flower" [value]="val" [scale]="0.75"></app-tile>
              </div>
            }
            <div style="width: 16px;"></div>
            @for (val of ['猫','老鼠','公鸡','蜈蚣']; track val) {
              <div class="pg-tile" (click)="addTile({type: 'animal', value: val})">
                <app-tile type="animal" [value]="val" [scale]="0.75"></app-tile>
              </div>
            }
            <div style="width: 16px;"></div>
            <div class="pg-tile" (click)="addTile({type: 'fly', value: '飞'})">
              <app-tile type="fly" value="飞" [scale]="0.75"></app-tile>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-card" style="width: 100%; max-width: 1000px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: var(--gold-primary); margin-top: 0; margin-bottom: 16px; display: flex; justify-content: space-between;">
          My Hand ({{ handTiles().length }}/14)
          <button class="btn-primary" style="padding: 4px 12px; font-size: 14px; background: #c62828;" (click)="clearAll()">Clear All</button>
        </h2>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap; min-height: 80px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px dashed var(--glass-border);">
          @for (tile of handTiles(); track $index) {
            <div class="pg-tile in-hand" (click)="removeTile($index)">
              <app-tile [type]="tile.type" [value]="tile.value" [scale]="0.9"></app-tile>
            </div>
          }
          @if (handTiles().length === 0) {
            <div style="color: #666; font-style: italic; align-self: center; width: 100%; text-align: center;">Click tiles above to add to your hand.</div>
          }
        </div>

        <h3 style="color: var(--gold-primary); margin-top: 20px; margin-bottom: 16px;">
          Flowers & Animals ({{ flowerTiles().length }})
        </h3>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; min-height: 60px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px dashed var(--glass-border);">
          @for (tile of flowerTiles(); track $index) {
            <div class="pg-tile in-hand" (click)="removeFlowerTile($index)">
              <app-tile [type]="tile.type" [value]="tile.value" [scale]="0.75"></app-tile>
            </div>
          }
          @if (flowerTiles().length === 0) {
            <div style="color: #666; font-style: italic; align-self: center; width: 100%; text-align: center; font-size: 14px;">(Optional) Flowers and Animals go here.</div>
          }
        </div>
      </div>

      <div class="glass-card" style="width: 100%; max-width: 1000px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: var(--gold-primary); margin-top: 0; margin-bottom: 16px;">Settings & Evaluation</h2>
        
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
          <label style="display: flex; align-items: center; gap: 8px; color: #eaeaea;">
            <input type="checkbox" [(ngModel)]="isSelfDraw" /> Self Draw (自摸)
          </label>
          <label style="display: flex; align-items: center; gap: 8px; color: #eaeaea;">
            <input type="checkbox" [(ngModel)]="isReplacement" /> Replacement Tile (杠上/花上)
          </label>
          <label style="display: flex; align-items: center; gap: 8px; color: #eaeaea;">
            <input type="checkbox" [(ngModel)]="isRobbingKong" /> Robbing Kong (抢杠)
          </label>
          
          <div style="display: flex; align-items: center; gap: 8px; color: #eaeaea;">
            Seat Wind: 
            <select [(ngModel)]="seatWind" style="background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border); border-radius: 4px; padding: 4px;">
              <option value="东">East</option>
              <option value="南">South</option>
              <option value="西">West</option>
              <option value="北">North</option>
            </select>
          </div>
          
          <div style="display: flex; align-items: center; gap: 8px; color: #eaeaea;">
            Round Wind: 
            <select [(ngModel)]="roundWind" style="background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border); border-radius: 4px; padding: 4px;">
              <option value="东">East</option>
              <option value="南">South</option>
              <option value="西">West</option>
              <option value="北">North</option>
            </select>
          </div>
        </div>

        <button class="btn-primary" style="width: 100%; padding: 12px; font-size: 18px;" (click)="calculateScore()" [disabled]="isCalculating()">
          {{ isCalculating() ? 'Calculating...' : 'Calculate Fan' }}
        </button>
        
        @if (evaluationResult()) {
          <div style="margin-top: 20px; padding: 16px; background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid var(--gold-secondary);">
            <h3 style="margin-top: 0; color: {{ evaluationResult()?.isWinning ? '#4caf50' : '#f44336' }}">
              {{ evaluationResult()?.isWinning ? 'WINNING HAND!' : 'NOT A WINNING HAND' }}
            </h3>
            
            @if (evaluationResult()?.isWinning && evaluationResult()?.result) {
              <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                <span style="font-size: 20px; color: #fff;">Total Fan:</span>
                <span style="font-size: 24px; font-weight: bold; color: var(--gold-primary);">{{ evaluationResult()?.result?.totalFan }} 番</span>
              </div>
              
              <ul style="color: #ccc; font-size: 16px; padding-left: 20px; margin: 0;">
                @for (detail of evaluationResult()?.result?.breakdown; track detail) {
                  <li style="margin-bottom: 4px;">{{ detail.name }} <strong style="color: #fff;">(+{{ detail.fan }})</strong></li>
                }
              </ul>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .pg-tile {
      cursor: pointer;
      transition: transform 0.1s;
    }
    .pg-tile:hover {
      transform: translateY(-4px);
    }
    .pg-tile:active {
      transform: translateY(0);
    }
    .in-hand {
      /* size handled by app-tile scaling */
    }
  `]
})
export class PlaygroundComponent {
  handTiles = signal<Tile[]>([]);
  flowerTiles = signal<Tile[]>([]);
  
  isSelfDraw = false;
  isReplacement = false;
  isRobbingKong = false;
  seatWind = '东';
  roundWind = '东';
  
  isCalculating = signal(false);
  evaluationResult = signal<any>(null);

  addTile(tile: Tile) {
    if (tile.type === 'flower' || tile.type === 'animal') {
      this.flowerTiles.update(t => [...t, tile]);
    } else {
      if (this.handTiles().length >= 14) return;
      this.handTiles.update(t => [...t, tile]);
    }
    this.evaluationResult.set(null);
  }

  removeTile(index: number) {
    this.handTiles.update(t => {
      const newArr = [...t];
      newArr.splice(index, 1);
      return newArr;
    });
    this.evaluationResult.set(null);
  }

  removeFlowerTile(index: number) {
    this.flowerTiles.update(t => {
      const newArr = [...t];
      newArr.splice(index, 1);
      return newArr;
    });
    this.evaluationResult.set(null);
  }

  clearAll() {
    this.handTiles.set([]);
    this.flowerTiles.set([]);
    this.evaluationResult.set(null);
  }

  async calculateScore() {
    if (this.handTiles().length < 1) return;
    
    this.isCalculating.set(true);
    
    try {
      const backendUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://m3p-mahjong.onrender.com';
        
      const response = await fetch(`${backendUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handTiles: this.handTiles(),
          flowers: this.flowerTiles(),
          exposedMelds: [], // Can implement melds builder later if requested
          isSelfDraw: this.isSelfDraw,
          isReplacement: this.isReplacement,
          isRobbingKong: this.isRobbingKong,
          seatWind: this.seatWind,
          roundWind: this.roundWind,
          allExposedTiles: [] // Can implement later
        })
      });
      
      const data = await response.json();
      this.evaluationResult.set(data);
    } catch (e) {
      console.error(e);
      alert('Error calculating score');
    } finally {
      this.isCalculating.set(false);
    }
  }
}
