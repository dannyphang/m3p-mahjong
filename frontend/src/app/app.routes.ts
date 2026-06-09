import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { RoomComponent } from './pages/room/room.component';
import { PlaygroundComponent } from './pages/playground/playground.component';
import { LamiLobbyComponent } from './pages/lami-lobby/lami-lobby.component';
import { LamiRoomComponent } from './pages/lami-room/lami-room.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'lami-lobby', component: LamiLobbyComponent },
  { path: 'lami-room', component: LamiRoomComponent },
  { path: 'room', component: RoomComponent },
  { path: 'playground', component: PlaygroundComponent },
  { path: '**', redirectTo: '' }
];
