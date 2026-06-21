import { Injectable } from '@angular/core';
import { getLocalItem, setLocalItem } from '../utils/storage';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private bgmAudio: HTMLAudioElement;
  private clickAudio: HTMLAudioElement;

  private isBgmMuted: boolean = true;
  private isSfxMuted: boolean = false;

  private hasInteracted: boolean = false;

  private _bgmVolume: number = 0.5;
  private _sfxVolume: number = 0.8;

  constructor() {
    this.bgmAudio = new Audio('assets/music/bgm.mp3');
    this.bgmAudio.loop = true;

    this.clickAudio = new Audio('assets/music/click.mp3');

    // Load BGM preferences
    const savedBgmVolume = getLocalItem('m3p_bgm_volume');
    if (savedBgmVolume !== null) this._bgmVolume = parseFloat(savedBgmVolume);

    const savedBgmMuted = getLocalItem('m3p_bgm_muted');
    if (savedBgmMuted) this.isBgmMuted = savedBgmMuted === 'true';

    // Load SFX preferences
    const savedSfxVolume = getLocalItem('m3p_sfx_volume');
    if (savedSfxVolume !== null) this._sfxVolume = parseFloat(savedSfxVolume);

    const savedSfxMuted = getLocalItem('m3p_sfx_muted');
    if (savedSfxMuted) this.isSfxMuted = savedSfxMuted === 'true';

    this.bgmAudio.volume = this._bgmVolume;
    this.clickAudio.volume = this._sfxVolume;

    // Modern browsers require interaction before playing audio
    const interactHandler = () => {
      this.hasInteracted = true;
      if (!this.isBgmMuted && this._bgmVolume > 0) {
        this.playBgm();
      }
      document.removeEventListener('click', interactHandler);
      document.removeEventListener('keydown', interactHandler);
    };

    document.addEventListener('click', interactHandler);
    document.addEventListener('keydown', interactHandler);

    // Global listener for UI clicks
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      // Play sound for buttons, links, or elements acting as buttons
      if (target.closest('button') || target.closest('a') || target.closest('[role="button"]') || target.closest('.btn') || target.closest('.btn-primary') || target.closest('.lami-tile-container')) {
        this.playClickSound();
      }
    });
  }

  get isMusicMuted(): boolean { return this.isBgmMuted; }
  get bgmVolume(): number { return this._bgmVolume; }

  get isSoundEffectsMuted(): boolean { return this.isSfxMuted; }
  get sfxVolume(): number { return this._sfxVolume; }

  setBgmVolume(val: number): void {
    this._bgmVolume = val;
    this.bgmAudio.volume = val;
    setLocalItem('m3p_bgm_volume', String(val));

    if (val === 0) {
      this.isBgmMuted = true;
      setLocalItem('m3p_bgm_muted', 'true');
      this.pauseBgm();
    } else {
      if (this.isBgmMuted) {
        this.isBgmMuted = false;
        setLocalItem('m3p_bgm_muted', 'false');
        if (this.hasInteracted) {
          this.playBgm();
        }
      }
    }
  }

  setSfxVolume(val: number): void {
    this._sfxVolume = val;
    this.clickAudio.volume = val;
    setLocalItem('m3p_sfx_volume', String(val));

    if (val === 0) {
      this.isSfxMuted = true;
      setLocalItem('m3p_sfx_muted', 'true');
    } else {
      if (this.isSfxMuted) {
        this.isSfxMuted = false;
        setLocalItem('m3p_sfx_muted', 'false');
      }
    }
  }

  toggleBgm(): void {
    this.isBgmMuted = !this.isBgmMuted;
    setLocalItem('m3p_bgm_muted', String(this.isBgmMuted));

    if (this.isBgmMuted) {
      this.pauseBgm();
    } else {
      if (this._bgmVolume === 0) {
        this.setBgmVolume(0.5);
      }
      if (this.hasInteracted) {
        this.playBgm();
      }
    }
  }

  toggleSfx(): void {
    this.isSfxMuted = !this.isSfxMuted;
    setLocalItem('m3p_sfx_muted', String(this.isSfxMuted));

    if (!this.isSfxMuted && this._sfxVolume === 0) {
      this.setSfxVolume(0.8);
    }
  }

  playClickSound() {
    if (!this.isSfxMuted && this._sfxVolume > 0) {
      const click = this.clickAudio.cloneNode() as HTMLAudioElement;
      click.volume = this._sfxVolume;
      click.play().catch(err => { });
    }
  }

  private playBgm() {
    this.bgmAudio.play().catch(err => {
      console.warn('Audio playback prevented by browser:', err);
    });
  }

  private pauseBgm() {
    this.bgmAudio.pause();
  }
}
