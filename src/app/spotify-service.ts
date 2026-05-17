import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Playlist } from './models/playlist';
import { PlaylistItemResponse } from './models/playlistItemResponse';
import { Track } from './models/track';
import { SpotifyAuthService } from './authorization-service';

@Injectable({
  providedIn: 'root'
})
export class SpotifyService {
  private authService = inject(SpotifyAuthService);
  spotifyRoot = "https://api.spotify.com/v1";
  searchUrl = `${this.spotifyRoot}/search`;
  playlistUrl = `${this.spotifyRoot}/playlists`;
  
  // Playback Control Endpoints
  playUrl = `${this.spotifyRoot}/me/player/play`;
  pauseUrl = `${this.spotifyRoot}/me/player/pause`;
  nextUrl = `${this.spotifyRoot}/me/player/next`;
  prevUrl = `${this.spotifyRoot}/me/player/previous`;
  shuffleUrl = `${this.spotifyRoot}/me/player/shuffle?state=false`;
  deviceUrl = `${this.spotifyRoot}/me/player/devices`;
  transferUrl = `${this.spotifyRoot}/me/player`;

  constructor(private http: HttpClient) { }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async seachPlaylists(searchTerm: string): Promise<any> {
    const params = new HttpParams()
      .set("q", searchTerm)
      .set("type", "playlist");
    return await firstValueFrom(this.http.get(this.searchUrl, { params }));
  }
  
  async getPlaylistSongs(playlist: Playlist): Promise<Track[]> {
    let itemsUrl = this.playlistUrl + `/${playlist.id}/tracks`;
    const queryParams = new HttpParams()
      .set('fields', 'items(track(name,uri)),next')
      .set('limit', '50');
      
    let tracks: Track[] = [];
    let count = 0;

    while (itemsUrl != null && count < 50) {
      count += 1;
      const playlistResponse = await firstValueFrom(this.http.get<PlaylistItemResponse>(itemsUrl, { params: queryParams }));
      tracks = tracks.concat(playlistResponse.items.map(item => item.track));
      itemsUrl = playlistResponse.next;       
    }
    return tracks; 
  }

  async startPlayback(tracks: Track[], deviceId?: string | null) {
    const uris = tracks.map(track => track.uri);
    const body = { uris: uris };
    let url = this.playUrl;
    
    if (deviceId) {
      await this.transferPlayback(deviceId);
      await this.delay(500); // Wait for hardware to wake up
      url += `?device_id=${deviceId}`;
    }

    try {
      const shuffleEndpoint = deviceId ? `${this.shuffleUrl}&device_id=${deviceId}` : this.shuffleUrl;
      await firstValueFrom(this.http.put(shuffleEndpoint, null, { responseType: 'text' }));
    } catch (err) {
      console.warn('Shuffle state update skipped:', err);
    }

    await firstValueFrom(this.http.put(url, body, {}));
  }

  // NEW: Resumes playback without sending a new queue of URIs
  async resumePlayback(deviceId?: string | null) {
    let url = this.playUrl;
    if (deviceId) {
      await this.transferPlayback(deviceId);
      await this.delay(500);
      url += `?device_id=${deviceId}`;
    }
    // Sending an empty object {} tells Spotify to just resume the existing context
    await firstValueFrom(this.http.put(url, {}, {}));
  }

  async pausePlayback(deviceId?: string | null) {
    let url = this.pauseUrl;
    if (deviceId) url += `?device_id=${deviceId}`;
    await firstValueFrom(this.http.put(url, null, { responseType: 'text' }));
  }

  // NEW: Skip to next track
  async skipNext(deviceId?: string | null) {
    let url = this.nextUrl;
    if (deviceId) url += `?device_id=${deviceId}`;
    await firstValueFrom(this.http.post(url, null, { responseType: 'text' }));
  }

  // NEW: Skip to previous track
  async skipPrevious(deviceId?: string | null) {
    let url = this.prevUrl;
    if (deviceId) url += `?device_id=${deviceId}`;
    await firstValueFrom(this.http.post(url, null, { responseType: 'text' }));
  }

  async transferPlayback(deviceId: string): Promise<any> {
    const body = { device_ids: [deviceId], play: false };
    try {
      return await firstValueFrom(this.http.put(this.transferUrl, body, { responseType: 'text' }));
    } catch (error) {
      console.warn('Playback transfer warning:', error);
    }
  }

  async getUserDevices(forceRefresh = false): Promise<any> {
    if (!forceRefresh) {
      const cachedDevices = localStorage.getItem('spotify_cached_devices');
      if (cachedDevices) return JSON.parse(cachedDevices);
    }
    const data = await firstValueFrom(this.http.get(this.deviceUrl));
    localStorage.setItem('spotify_cached_devices', JSON.stringify(data));
    return data;
  }
}