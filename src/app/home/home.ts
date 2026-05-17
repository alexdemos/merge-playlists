import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SpotifyService } from '../spotify-service';
import { Playlist } from '../models/playlist';
import { Track } from '../models/track';
import { PlaylistTile } from '../playlist-tile/playlist-tile';
import { SpotifyAuthService } from '../authorization-service';
import { MergePlaylistsService } from '../merge-playlists-service';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { SpotifyDevice } from '../models/spotify-device';

@Component({
  selector: 'app-home',
  imports: [PlaylistTile, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  public spotifyService = inject(SpotifyService);
  public mergeService = inject(MergePlaylistsService);
  public authService = inject(SpotifyAuthService);
  private platformId = inject(PLATFORM_ID);

  homeForm = new FormGroup({});
  searchedPlaylists: Playlist[] = [];
  selectedPlaylists: Playlist[] = [];
  devices: SpotifyDevice[] = [];
  selectedDevice: SpotifyDevice | null = null;
  
  // NEW: State flag to track if we need to regenerate the queue
  playlistConfigChanged = true; 

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const hasToken = !!localStorage.getItem('spotify_access_token');
      this.authService.isLoggedIn.set(hasToken);
      if (hasToken) this.loadDevices();
    }

    // Reactively watch for ratio changes. If a user types a new ratio, flag it for generation.
    this.homeForm.valueChanges.subscribe(() => {
      this.playlistConfigChanged = true;
    });
  }

  async loadDevices(forceRefresh = false) {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const data: any = await this.spotifyService.getUserDevices(forceRefresh);
        this.devices = data.devices || [];
        const activeDevice = this.devices.find(d => d.is_active);
        
        if (activeDevice) {
          this.selectedDevice = activeDevice;
        } else if (this.devices.length > 0 && !this.selectedDevice) {
          this.selectedDevice = this.devices[0];
        }
      } catch (err) {
        console.error('Failed to load user devices:', err);
      }
    }
  }

  onDeviceChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const deviceId = selectElement.value;
    this.selectedDevice = this.devices.find(d => d.id === deviceId) || null;
  }

  searchPlaylists(query: string) {    
    this.spotifyService.seachPlaylists(query)
      .then(data => {
        this.searchedPlaylists = data['playlists']['items'].filter((value: null) => value != null);
      })
      .catch(err => console.error('Error searching playlists:', err));
  }  

  pinPlaylist(playlist: Playlist) {
    // If they add or remove a playlist, we must flag it for generation
    this.playlistConfigChanged = true; 

    if (!this.selectedPlaylists.includes(playlist)) {
      if (this.selectedPlaylists.length < 5) {
        this.selectedPlaylists.push(playlist);
        playlist.isSelected = true;
        this.homeForm.addControl(playlist.id, new FormControl(1));
      }
    } else {
      this.selectedPlaylists.splice(this.selectedPlaylists.indexOf(playlist), 1);
      playlist.isSelected = false;
      this.homeForm.removeControl(playlist.id);
    }
  }

  async setPlaylistSongs() {
    for (const playlist of this.selectedPlaylists) {
      const data = await this.spotifyService.getPlaylistSongs(playlist);
      playlist.tracks = [...data];
    }
  }

  login() { this.authService.login(); }
  
  logout() {
    this.authService.logout();
    this.devices = [];
    this.selectedDevice = null;
    this.selectedPlaylists = [];
    this.searchedPlaylists = [];
    this.playlistConfigChanged = true;
  }

  getActiveDevice(): SpotifyDevice | null {
    return this.devices.find(d => d.is_active) || null;
  }

  async play() {
    if (!this.selectedDevice) {
      window.alert("Please select a device to play the music on!");
      return;
    }

    const deviceId = this.selectedDevice.id;

    // Shift active flags immediately for UI responsiveness
    this.devices.forEach(d => d.is_active = false);
    this.selectedDevice.is_active = true;

    // If ratios or selected playlists have changed, generate a NEW queue
    if (this.playlistConfigChanged) {
      const userConfirmed = window.confirm("This will generate a new blended queue. Proceed?");
      if (!userConfirmed) return;

      const ratios = this.homeForm.value as Record<string, any>;
      this.selectedPlaylists.forEach(playlist => {
        playlist.ratio = Math.max(ratios[playlist.id], 1);
      });

      await this.setPlaylistSongs();
      let mergedTracks: Track[] = this.mergeService.mergePlaylists(this.selectedPlaylists);
      let firstHundred = mergedTracks.slice(0, 100);
      
      await this.spotifyService.startPlayback(firstHundred, deviceId);
      
      // Successfully generated, so reset the flag
      this.playlistConfigChanged = false; 
    } else {
      // Nothing changed! Just tell Spotify to resume the existing queue.
      await this.spotifyService.resumePlayback(deviceId);
    }
  }

  async pause() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice && activeDevice.id) {
      try {
        await this.spotifyService.pausePlayback(activeDevice.id);
        activeDevice.is_active = false;
      } catch (err) {
        console.error('Failed to pause playback:', err);
      }
    }
  }

  async nextTrack() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice?.id) {
      await this.spotifyService.skipNext(activeDevice.id);
    }
  }

  async prevTrack() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice?.id) {
      await this.spotifyService.skipPrevious(activeDevice.id);
    }
  }
}