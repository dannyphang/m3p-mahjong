import { Injectable } from '@angular/core';
import { getLocalItem, setLocalItem } from '../utils/storage';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private bgmAudio: HTMLAudioElement;
  private isMuted: boolean = true;
  private hasInteracted: boolean = false;
  private _volume: number = 0.5;

  constructor() {
    this.bgmAudio = new Audio('assets/music/bgm.mp3');
    this.bgmAudio.loop = true;
    
    const savedVolume = getLocalItem('m3p_music_volume');
    if (savedVolume !== null) {
      this._volume = parseFloat(savedVolume);
    }
    this.bgmAudio.volume = this._volume;
    
    // Try to load user preference
    const savedState = getLocalItem('m3p_music_muted');
    if (savedState) {
      this.isMuted = savedState === 'true';
    }

    // Modern browsers require interaction before playing audio
    const interactHandler = () => {
      this.hasInteracted = true;
      if (!this.isMuted && this._volume > 0) {
        this.playBgm();
      }
      document.removeEventListener('click', interactHandler);
      document.removeEventListener('keydown', interactHandler);
    };

    document.addEventListener('click', interactHandler);
    document.addEventListener('keydown', interactHandler);
  }

  get isMusicMuted(): boolean {
    return this.isMuted;
  }

  get volume(): number {
    return this._volume;
  }

  setVolume(val: number): void {
    this._volume = val;
    this.bgmAudio.volume = val;
    setLocalItem('m3p_music_volume', String(val));

    if (val === 0) {
      this.isMuted = true;
      setLocalItem('m3p_music_muted', 'true');
      this.pauseBgm();
    } else {
      // If we increase volume from 0, auto-unmute
      if (this.isMuted) {
        this.isMuted = false;
        setLocalItem('m3p_music_muted', 'false');
        if (this.hasInteracted) {
          this.playBgm();
        }
      }
    }
  }

  toggleMusic(): void {
    this.isMuted = !this.isMuted;
    setLocalItem('m3p_music_muted', String(this.isMuted));
    
    if (this.isMuted) {
      this.pauseBgm();
    } else {
      // If unmuting but volume is 0, set to 0.5 default
      if (this._volume === 0) {
        this.setVolume(0.5);
      }
      if (this.hasInteracted) {
        this.playBgm();
      }
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
