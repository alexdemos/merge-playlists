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
  
  playlistConfigChanged = true; 
  CACHE_PLAYLIST_NAME = "My Playlist Blender Cache";

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const hasToken = !!localStorage.getItem('spotify_access_token');
      this.authService.isLoggedIn.set(hasToken);
      if (hasToken) this.loadDevices();
    }
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

  getMergedTracks(): Promise<Track[]> {
    const ratios = this.homeForm.value as Record<string, any>;
    this.selectedPlaylists.forEach(playlist => {
      playlist.ratio = Math.max(ratios[playlist.id], 1);
    });
    return this.setPlaylistSongs().then(() => {
      return this.mergeService.mergePlaylists(this.selectedPlaylists);
    });
  }

  async play() {
    if (!this.selectedDevice) {
      window.alert("Please select a device to play the music on!");
      return;
    }

    const deviceId = this.selectedDevice.id;
    this.devices.forEach(d => d.is_active = false);
    this.selectedDevice.is_active = true;

    if (this.playlistConfigChanged) {
      const mergedTracks = await this.getMergedTracks();
      
      if (mergedTracks.length === 0) {
        window.alert("No songs found to blend!");
        return;
      }

      // If greater than 100 tracks, trigger the streamlined warning prompt
      if (mergedTracks.length > 100) {
        const message = 
          `This large mix (${mergedTracks.length} songs) requires a helper playlist.\n\n` +
          `• It will be saved as "${this.CACHE_PLAYLIST_NAME}".\n` +
          `• Future big mixes will overwrite this playlist.\n` +
          `• Click "Save Mix to Spotify" later if you want a permanent copy.\n\n` +
          `Proceed with playback?`;

        const userConfirmed = window.confirm(message);
        if (!userConfirmed) return;

        try {
          const userId = await this.spotifyService.getCurrentUserId();
          let playlistId = await this.spotifyService.findUserPlaylistByName(this.CACHE_PLAYLIST_NAME);
          
          if (!playlistId) {
            const newPlaylist = await this.spotifyService.createPlaylist(userId, this.CACHE_PLAYLIST_NAME, "Automated blending cache track area.");
            playlistId = newPlaylist.id;
          }
          
          await this.spotifyService.overwritePlaylistTracks(playlistId!, mergedTracks);
          const contextUri = `spotify:playlist:${playlistId}`;
          
          await this.spotifyService.startPlayback([], deviceId, contextUri);
        } catch (err) {
          console.error("Failed managing automated context cache playlist layer:", err);
          window.alert("Error setting up large context stream, falling back to shortened explicit arrays.");
          await this.spotifyService.startPlayback(mergedTracks.slice(0, 100), deviceId);
        }
      } else {
        // Runs immediately with no alert pop-up window
        await this.spotifyService.startPlayback(mergedTracks, deviceId);
      }
      
      this.playlistConfigChanged = false; 
    } else {
      await this.spotifyService.resumePlayback(deviceId);
    }
  }

  async saveCurrentPlaylist() {
    if (this.selectedPlaylists.length === 0) {
      window.alert("Please blend at least one pinned target to save.");
      return;
    }

    try {
      const mergedTracks = await this.getMergedTracks();
      const customName = "Blended: " + this.selectedPlaylists.map(p => p.name).join(' + ');
      
      const userId = await this.spotifyService.getCurrentUserId();
      const created = await this.spotifyService.createPlaylist(userId, customName, `Saved export blend containing: ${customName}`);
      
      await this.spotifyService.overwritePlaylistTracks(created.id, mergedTracks);
      window.alert(`Successfully exported custom configuration as permanent folder reference: "${customName}"`);
    } catch (err) {
      console.error("Failed executing storage save track configuration operation:", err);
      window.alert("Could not export configuration snapshot onto your personal account.");
    }
  }

  async pause() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice?.id) {
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
    if (activeDevice?.id) await this.spotifyService.skipNext(activeDevice.id);
  }

  async prevTrack() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice?.id) await this.spotifyService.skipPrevious(activeDevice.id);
  }
}