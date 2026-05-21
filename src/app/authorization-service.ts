import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core'; 
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; 
  refresh_token?: string; 
  scope: string;
}

@Injectable({
  providedIn: 'root'
})
export class SpotifyAuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  private readonly clientId = '25700f357a5d461586530408a940333d';
  
  private readonly scopes = 'user-read-private user-read-email user-modify-playback-state playlist-read-private playlist-modify-public playlist-modify-private ugc-image-upload user-read-playback-state';

  private activeRefreshPromise: Promise<string | null> | null = null;

  public isLoggedIn = signal<boolean>(this.checkInitialLoginStatus());

  // --- DYNAMIC REDIRECT URI GETTER ---
  // This cleans up both naming bugs and handles localhost vs production environments safely.
  private get redirectUri(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/callback`;
    }
    return 'http://localhost:4200/callback';
  }

  // --- PUBLIC API ---

  async login(): Promise<void> {
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    localStorage.setItem('spotify_code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    const params = {
      response_type: 'code',
      client_id: this.clientId,
      scope: this.scopes,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: this.redirectUri, // FIX: Removed () and matched property name
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
  }

  async handleCallback(code: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) throw new Error('Missing code verifier;');

    const payload = new HttpParams()
      .set('client_id', this.clientId)
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', this.redirectUri) // FIX: Now correctly points to the renamed getter
      .set('code_verifier', codeVerifier);

    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });

    try {
      const response = await lastValueFrom(
        this.http.post<SpotifyTokenResponse>('https://accounts.spotify.com/api/token', payload.toString(), { headers })
      );
      
      this.saveTokens(response);
      localStorage.removeItem('spotify_code_verifier');
    } catch (error) {
      console.error('Failed token exchange:', error);
      throw error;
    }
  }

  async refreshToken(): Promise<string | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
      this.logout();
      return null;
    }

    const payload = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('refresh_token', refreshToken)
      .set('client_id', this.clientId);

    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });

    this.activeRefreshPromise = lastValueFrom(
      this.http.post<SpotifyTokenResponse>('https://accounts.spotify.com/api/token', payload.toString(), { headers })
    ).then(
      (response) => {
        this.saveTokens(response);
        this.activeRefreshPromise = null;
        return response.access_token;
      },
      (error) => {
        console.error('Failed to refresh token, logging out:', error);
        this.activeRefreshPromise = null;
        this.logout();
        return null;
      }
    );

    return this.activeRefreshPromise;
  }

  async getValidToken(): Promise<string | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    if (this.isTokenExpired()) {
      return await this.refreshToken();
    }

    return localStorage.getItem('spotify_access_token');
  }

  logout(): void {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires_at');
    localStorage.removeItem('spotify_cached_devices');
    
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  // --- PRIVATE HELPERS ---

  private checkInitialLoginStatus(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return !!localStorage.getItem('spotify_access_token');
  }

  private isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem('spotify_token_expires_at');
    if (!expiresAt) return true;
    return Date.now() > (Number(expiresAt) - 60000);
  }

  private saveTokens(tokens: SpotifyTokenResponse): void {
    localStorage.setItem('spotify_access_token', tokens.access_token);
    
    const expiresAt = Date.now() + (tokens.expires_in * 1000);
    localStorage.setItem('spotify_token_expires_at', expiresAt.toString());

    if (tokens.refresh_token) {
      localStorage.setItem('spotify_refresh_token', tokens.refresh_token);
    }

    this.isLoggedIn.set(true);
  }

  private generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values).map((x) => possible[x % possible.length]).join('');
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}