import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
// 1. Make sure withInterceptors is imported here
import { provideHttpClient, withInterceptors } from '@angular/common/http'; 
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';
import { spotifyInterceptor } from './spotify.interceptor'; // Adjust path if necessary

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes), 
    provideClientHydration(withEventReplay()),
    
    // 2. Put the interceptor configuration INSIDE the providers array
    provideHttpClient(
      withInterceptors([spotifyInterceptor])
    )
  ]
};