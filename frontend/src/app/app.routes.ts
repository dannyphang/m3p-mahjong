import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { RoomComponent } from './pages/room/room.component';
import { PlaygroundComponent } from './pages/playground/playground.component';
import { LamiLobbyComponent } from './pages/lami-lobby/lami-lobby.component';
import { LamiRoomComponent } from './pages/lami-room/lami-room.component';
import { LoginComponent } from './pages/login/login.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'lami-lobby', component: LamiLobbyComponent, canActivate: [authGuard] },
  { path: 'lami-room', component: LamiRoomComponent, canActivate: [authGuard] },
  { path: 'room', component: RoomComponent, canActivate: [authGuard] },
  { path: 'stats', loadComponent: () => import('./pages/stats/stats.component').then(m => m.StatsComponent), canActivate: [authGuard] },
  { path: 'playground', component: PlaygroundComponent },
  { path: '**', redirectTo: '' }
];
