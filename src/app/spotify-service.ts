import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { first, firstValueFrom, Observable } from 'rxjs';
import { Playlist } from './models/playlist';
import {PlaylistItemResponse } from './models/playlistItemResponse'
import { Track } from './models/track';
import { SpotifyAuthService } from './authorization-service';
import { Component, inject } from '@angular/core';


@Injectable({
  providedIn: 'root'
})
export class SpotifyService {
  private authService = inject(SpotifyAuthService);
  spotifyRoot = "https://api.spotify.com/v1"
  searchUrl = `${this.spotifyRoot}/search`;
  playlistUrl = `${this.spotifyRoot}/playlists`;
  playUrl = `${this,this.spotifyRoot}/me/player/play`
  shuffleUrl = `${this,this.spotifyRoot}/me/player/shuffle?state=false`
  accessToken: string = "";
  constructor(private http: HttpClient) { }
  
  async seachPlaylists(searchTerm: string): Promise<any> {
    const url = this.searchUrl;
    const searchParams = {
          q: searchTerm,
          type: 'playlist'
        };
    const params = new HttpParams({
      fromObject: searchParams,
    });
  
    params.append("q", searchTerm);
    params.append("type","playlist");
    return await firstValueFrom(this.http.get(url, {params}));
  }
  
    async getPlaylistSongs(playlist: Playlist): Promise<Track[]>{
      let itemsUrl = this.playlistUrl + `/${playlist.id}/tracks`;
      const queryParams = new HttpParams()
      .set('fields', 'items(track(name,uri)),next') // No need to manually hex-encode!
      .set('limit', '50');
      let tracks: Track[] = []
      let count = 0

      while(itemsUrl != null && count < 50){
        count += 1;
        const playlisttResponse = await firstValueFrom(this.http.get<PlaylistItemResponse>(itemsUrl, { params: queryParams}));
        tracks = tracks.concat(playlisttResponse.items.map(item => item.track))
        itemsUrl = playlisttResponse.next       
      }
      return tracks; 
    }

    async getSongsFromUrl(url: string, headers: HttpHeaders): Promise<any>{
      return await firstValueFrom(this.http.get(url, {headers})); 
    }

    async getPlaylistAmount(url: string, headers: HttpHeaders): Promise<any>{
      const fields = "?fields=total";
      const fieldsUrl = url + fields;
      return await firstValueFrom(this.http.get(fieldsUrl, {headers}));
    }

    async startPlayback(tracks: Track[]){
      const uris = tracks.map(track => track.uri);
      const body = {
      uris: uris
      };
      await firstValueFrom(this.http.put(this.shuffleUrl, null, {responseType: 'text'}))
      await firstValueFrom(this.http.put(this.playUrl, body, {}))
    }
}
