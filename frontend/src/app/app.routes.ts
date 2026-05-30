import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { RoomComponent } from './pages/room/room.component';
import { PlaygroundComponent } from './pages/playground/playground.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'room', component: RoomComponent },
  { path: 'playground', component: PlaygroundComponent },
  { path: '**', redirectTo: '' }
];
