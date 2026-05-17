import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { SpotifyAuthService } from './authorization-service'; // Adjust path

export const spotifyInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(SpotifyAuthService);

  // STEP 1: Only intercept requests meant for the Spotify API.
  // We don't want to leak our Spotify token to your own backend or other 3rd party APIs!
  if (req.url.startsWith('https://api.spotify.com/')) {
    
    // STEP 2: Convert the Promise from getValidToken() into an Observable using from()
    return from(authService.getValidToken()).pipe(
      
      // STEP 3: Wait for the token, then modify the request
      switchMap((token) => {
        if (token) {
          // Requests are immutable in Angular, so we must clone it to modify headers
          const modifiedReq = req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`
            }
          });
          // Send the modified request on its way
          return next(modifiedReq);
        }
        
        // If there's no token (e.g., user logged out), just send the original request.
        // It will likely fail with a 401, which is expected.
        return next(req);
      })
    );
  }

  // If the request is NOT for Spotify, ignore it completely
  return next(req);
};