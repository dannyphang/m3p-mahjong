import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div class="max-w-md w-full bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700">
        <h2 class="text-3xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          M3P Mahjong
        </h2>
        
        <div class="space-y-4">
          <button 
            (click)="loginGoogle()"
            class="w-full py-3 px-4 bg-white text-gray-900 font-semibold rounded-lg shadow-md hover:bg-gray-100 transition duration-300 flex items-center justify-center space-x-2">
            <svg class="w-6 h-6" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>

          <div class="relative flex py-2 items-center">
            <div class="flex-grow border-t border-gray-600"></div>
            <span class="flex-shrink-0 mx-4 text-gray-400 text-sm">OR</span>
            <div class="flex-grow border-t border-gray-600"></div>
          </div>

          <button 
            (click)="loginGuest()"
            class="w-full py-3 px-4 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-600 border border-gray-600 transition duration-300 flex items-center justify-center space-x-2">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span>Play as Guest</span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);

  constructor() {
    this.authService.userProfile$.subscribe(profile => {
      if (profile) {
        this.router.navigate(['/']); // redirect to home
      }
    });
  }

  async loginGoogle() {
    try {
      await this.authService.loginWithGoogle();
    } catch (err) {
      console.error('Google login failed', err);
    }
  }

  async loginGuest() {
    try {
      await this.authService.loginAsGuest();
    } catch (err) {
      console.error('Guest login failed', err);
    }
  }
}
