import { Component, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h1 class="login-title">Welcome to M3P Mahjong</h1>
        <p class="login-subtitle">Sign in to track your stats and coins</p>
        
        <div class="login-actions">
          <button class="btn-google" (click)="signInWithGoogle()" [disabled]="isLoading">
            <svg class="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          
          <div class="divider">
            <span>OR</span>
          </div>
          
          <button class="btn-guest" (click)="playAsGuest()" [disabled]="isLoading">
            <svg class="guest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Play as Guest
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 60px);
      background: radial-gradient(circle at center, #2a2a35 0%, #1a1a24 100%);
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    .login-card {
      background: rgba(40, 40, 50, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 3rem;
      width: 100%;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      animation: floatIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    @keyframes floatIn {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    
    .login-title {
      font-size: 1.8rem;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 0.5rem;
      letter-spacing: -0.5px;
    }
    
    .login-subtitle {
      color: #a0a0b0;
      font-size: 0.95rem;
      margin-bottom: 2.5rem;
    }
    
    .login-actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.85rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    
    .btn-google {
      background: white;
      color: #3c4043;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .btn-google:hover:not(:disabled) {
      background: #f8f9fa;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.15);
    }
    
    .btn-google:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .google-icon {
      width: 20px;
      height: 20px;
    }
    
    .btn-guest {
      background: linear-gradient(135deg, #ff9800, #f57c00);
      color: white;
      box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
    }
    
    .btn-guest:hover:not(:disabled) {
      background: linear-gradient(135deg, #ffa726, #fb8c00);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(255, 152, 0, 0.4);
    }
    
    .btn-guest:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .guest-icon {
      width: 20px;
      height: 20px;
    }
    
    .divider {
      position: relative;
      text-align: center;
      margin: 1rem 0;
    }
    
    .divider::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
    }
    
    .divider span {
      position: relative;
      background: #23232e;
      padding: 0 1rem;
      color: #707080;
      font-size: 0.85rem;
      font-weight: 500;
    }
  `]
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);
  ngZone = inject(NgZone);
  isLoading = false;

  constructor() {
    this.authService.userProfile$.subscribe(profile => {
      // Only redirect if we are currently on the login page
      if (profile && this.router.url === '/login') {
        this.ngZone.run(() => {
          this.router.navigate(['/']); // redirect to home
        });
      }
    });
  }

  async signInWithGoogle() {
    this.isLoading = true;
    try {
      await this.authService.loginWithGoogle();
    } catch (error) {
      console.error('Login error', error);
      alert('Failed to login with Google: ' + (error as Error).message);
      this.ngZone.run(() => {
        this.isLoading = false;
      });
    }
  }

  async playAsGuest() {
    this.isLoading = true;
    try {
      await this.authService.loginAsGuest();
    } catch (error) {
      console.error('Guest login error', error);
      alert('Failed to login as guest');
      this.ngZone.run(() => {
        this.isLoading = false;
      });
    }
  }
}
