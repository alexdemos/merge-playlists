import { Routes } from '@angular/router';
import { Home } from './home/home';
import { CallbackComponent } from './callback';

export const routes: Routes = [
  { path: 'callback', component: CallbackComponent },
  { path: 'dashboard', component: Home }, 
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' }
];
