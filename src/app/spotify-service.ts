import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Playlist } from './models/playlist';
import { PlaylistItemResponse } from './models/playlistItemResponse';
import { Track } from './models/track';
import { SpotifyAuthService } from './authorization-service';

@Injectable({
  providedIn: 'root'
})
export class SpotifyService {
  private http = inject(HttpClient);
  private authService = inject(SpotifyAuthService);
  
  spotifyRoot = "https://api.spotify.com/v1";
  searchUrl = `${this.spotifyRoot}/search`;
  playlistUrl = `${this.spotifyRoot}/playlists`;
  playUrl = `${this.spotifyRoot}/me/player/play`;
  pauseUrl = `${this.spotifyRoot}/me/player/pause`;
  nextUrl = `${this.spotifyRoot}/me/player/next`;
  prevUrl = `${this.spotifyRoot}/me/player/previous`;
  shuffleUrl = `${this.spotifyRoot}/me/player/shuffle?state=false`;
  deviceUrl = `${this.spotifyRoot}/me/player/devices`;
  transferUrl = `${this.spotifyRoot}/me/player`;

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async seachPlaylists(searchTerm: string): Promise<any> {
    const params = new HttpParams().set("q", searchTerm).set("type", "playlist");
    return await firstValueFrom(this.http.get(this.searchUrl, { params }));
  }
  
  async getPlaylistSongs(playlist: Playlist): Promise<Track[]> {
    let itemsUrl = this.playlistUrl + `/${playlist.id}/items`;
    const queryParams = new HttpParams()
  .set('fields', 'items(track(name,uri,album(images))),next')
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

  async startPlayback(tracks: Track[], deviceId?: string | null, contextUri?: string | null) {
    let url = this.playUrl;
    if (deviceId) {
      await this.transferPlayback(deviceId);
      await this.delay(500); 
      url += `?device_id=${deviceId}`;
    }

    try {
      const shuffleEndpoint = deviceId ? `${this.shuffleUrl}&device_id=${deviceId}` : this.shuffleUrl;
      await firstValueFrom(this.http.put(shuffleEndpoint, null, { responseType: 'text' }));
    } catch (err) {
      console.warn('Shuffle state update skipped:', err);
    }

    const body = contextUri ? { context_uri: contextUri } : { uris: tracks.map(t => t.uri) };
    await firstValueFrom(this.http.put(url, body, {}));
  }

  async resumePlayback(deviceId?: string | null) {
    let url = this.playUrl;
    if (deviceId) {
      await this.transferPlayback(deviceId);
      await this.delay(500);
      url += `?device_id=${deviceId}`;
    }
    await firstValueFrom(this.http.put(url, {}, {}));
  }

  async pausePlayback(deviceId?: string | null) {
    let url = this.pauseUrl;
    if (deviceId) url += `?device_id=${deviceId}`;
    await firstValueFrom(this.http.put(url, null, { responseType: 'text' }));
  }

  async skipNext(deviceId?: string | null) {
    let url = this.nextUrl;
    if (deviceId) url += `?device_id=${deviceId}`;
    await firstValueFrom(this.http.post(url, null, { responseType: 'text' }));
  }

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
  
  async getCurrentUserId(): Promise<string> {
    const data: any = await firstValueFrom(this.http.get(`${this.spotifyRoot}/me`));
    return data.id;
  }

  async findUserPlaylistByName(name: string): Promise<string | null> {
    let url = `${this.spotifyRoot}/me/playlists?limit=50`;
    while (url) {
      const data: any = await firstValueFrom(this.http.get(url));
      const found = data.items.find((p: any) => p.name === name);
      if (found) return found.id;
      url = data.next;
    }
    return null;
  }

  async createPlaylist(userId: string, name: string, description: string): Promise<any> {
    const body = { name, description, public: false };
    return await firstValueFrom(this.http.post(`${this.spotifyRoot}/users/${userId}/playlists`, body));
  }

  async overwritePlaylistTracks(playlistId: string, tracks: Track[]) {
    const uris = tracks.map(t => t.uri);
    const firstChunk = uris.slice(0, 100);
    
    await firstValueFrom(this.http.put(`${this.spotifyRoot}/playlists/${playlistId}/items`, { uris: firstChunk }));

    for (let i = 100; i < uris.length; i += 100) {
      const nextChunk = uris.slice(i, i + 100);
      await firstValueFrom(this.http.post(`${this.spotifyRoot}/playlists/${playlistId}/items`, { uris: nextChunk }));
    }
  }

  // NEW: Deletes (unfollows) a playlist from the user's account
  async unfollowPlaylist(playlistId: string): Promise<any> {
    return await firstValueFrom(this.http.delete(`${this.spotifyRoot}/playlists/${playlistId}/followers`));
  }

  async uploadPlaylistCoverImage(playlistId: string, base64Image: string): Promise<any> {
  // Remove data URL prefix if it exists (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Image.replace(/^data:image\/jpeg;base64,/, "");
    
    return await firstValueFrom(
      this.http.put(
        `${this.spotifyRoot}/playlists/${playlistId}/images`, 
        cleanBase64, 
        {
          headers: { 'Content-Type': 'image/jpeg' },
          responseType: 'text' // Spotify returns a 202 Accepted status with an empty body
        }
      )
    );
  }
}