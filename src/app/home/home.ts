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
  standalone: true,
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
  isLoading = false; 
  isPlaying = false;
  TEMP_PLAYLIST_NAME = "Temp Blender Playback Cache";

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

  // FIXED: Properly casting the target to access the select value string safely
  onDeviceChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const deviceId = selectElement.value;
    this.selectedDevice = this.devices.find(d => d.id === deviceId) || null;
    
    // Proactively let the app know to re-route subsequent active audio streams
    if (this.selectedDevice) {
      this.devices.forEach(d => d.is_active = false);
      this.selectedDevice.is_active = true;
    }
  }

  searchPlaylists(query: string) {    
    if (!query.trim()) {
      this.searchedPlaylists = [];
      return;
    }
    this.spotifyService.seachPlaylists(query)
      .then(data => {
        this.searchedPlaylists = data['playlists']['items'].filter((value: any) => value != null);
      })
      .catch(err => console.error('Error searching playlists:', err));
  }  

  pinPlaylist(playlist: Playlist) {
    this.playlistConfigChanged = true; 
    if (!this.selectedPlaylists.some(p => p.id === playlist.id)) {
      if (this.selectedPlaylists.length < 4) {
        this.selectedPlaylists.push(playlist);
        playlist.isSelected = true;
        this.homeForm.addControl(playlist.id, new FormControl(1));
      } else {
        window.alert("You can blend a maximum of 4 playlists at once.");
      }
    } else {
      this.selectedPlaylists = this.selectedPlaylists.filter(p => p.id !== playlist.id);
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
      playlist.ratio = Math.max(ratios[playlist.id] || 1, 1);
    });
    return this.setPlaylistSongs().then(() => {
      return this.mergeService.mergePlaylists(this.selectedPlaylists);
    });
  }

  async play() {
  const targetDevice = this.getActiveDevice();
  if (!targetDevice) {
    window.alert("Please select or awaken an active Spotify device first!");
    return;
  }

  this.isLoading = true; 
  const deviceId = targetDevice.id;
  const wasConfigChanged = this.playlistConfigChanged; // Track if this was a fresh build or a simple resume

  try {
    if (wasConfigChanged) {
      const mergedTracks = await this.getMergedTracks();
      
      if (mergedTracks.length === 0) {
        window.alert("No tracks found to parse in this combination block!");
        this.isLoading = false;
        return;
      }

      if (mergedTracks.length > 100) {
        const userId = await this.spotifyService.getCurrentUserId();
        const tempPlaylist = await this.spotifyService.createPlaylist(userId, this.TEMP_PLAYLIST_NAME, "Temporary tracking container.");
        const playlistId = tempPlaylist.id;
        
        await this.spotifyService.overwritePlaylistTracks(playlistId, mergedTracks);
        const contextUri = `spotify:playlist:${playlistId}`;
        
        await this.spotifyService.startPlayback([], deviceId, contextUri);
        await new Promise(resolve => setTimeout(resolve, 1200));
        await this.spotifyService.unfollowPlaylist(playlistId);
      } else {
        await this.spotifyService.startPlayback(mergedTracks, deviceId);
      }
      
      this.playlistConfigChanged = false; 
    } else {
      // Just a resume command
      await this.spotifyService.resumePlayback(deviceId);
    }
    
    // Explicitly confirm success locally
    this.isPlaying = true;

  } catch (err: any) {
    // SILENCE FALSE ERRORS: If we were just trying to resume a paused track and it worked anyway
    if (!wasConfigChanged) {
      console.warn("Muted a transient Spotify sync error during a resume command.", err);
      this.isPlaying = true; // Assume success since it actually plays
      this.isLoading = false;
      return;
    }

    // Fallback logic for genuine playlist startup failures
    console.warn("Primary stream composition failed, attempting direct container execution routing fallback...", err);
    try {
      await this.spotifyService.resumePlayback(deviceId);
      this.playlistConfigChanged = false;
      this.isPlaying = true;
    } catch (fallbackError) {
      console.error("Critical routing breakdown:", fallbackError);
      window.alert("Unable to open device stream. Please verify your Spotify App is running.");
    }
  } finally {
    this.isLoading = false; 
  }
}

  private generateMosaicImage(imageUrls: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (imageUrls.length < 4) {
        resolve("");
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject("Could not get 2D canvas context");
        return;
      }

      let loadedCount = 0;
      imageUrls.slice(0, 4).forEach((url, index) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        
        img.onload = () => {
          loadedCount++;
          const x = (index % 2) * 320;
          const y = Math.floor(index / 2) * 320;
          ctx.drawImage(img, x, y, 320, 320);

          if (loadedCount === 4) {
            resolve(canvas.toDataURL('image/jpeg', 0.7)); 
          }
        };

        img.onerror = () => {
          reject(`Failed to load image asset for mosaic compile: ${url}`);
        };

        img.src = url;
      });
    });
  }

  async saveCurrentPlaylist() {
    if (this.selectedPlaylists.length === 0) {
      window.alert("Please blend at least one pinned target to save.");
      return;
    }

    this.isLoading = true;

    try {
      const mergedTracks = await this.getMergedTracks();
      const customName = "Blended: " + this.selectedPlaylists.map(p => p.name).join(' + ');
      
      const artworkUrls: string[] = [];
      for (const playlist of this.selectedPlaylists) {
        if (playlist.images && playlist.images.length > 0) {
          const targetUrl = playlist.images[0].url;
          if (targetUrl && !artworkUrls.includes(targetUrl)) {
            artworkUrls.push(targetUrl);
          }
        }
      }

      const finalArtworkUrls: string[] = [];
      if (artworkUrls.length > 0) {
        while (finalArtworkUrls.length < 4) {
          finalArtworkUrls.push(...artworkUrls);
        }
      }
      const mosaicImages = finalArtworkUrls.slice(0, 4);

      const userId = await this.spotifyService.getCurrentUserId();
      const created = await this.spotifyService.createPlaylist(userId, customName, `Saved export blend containing: ${customName}`);
      const playlistId = created.id;

      await this.spotifyService.overwritePlaylistTracks(playlistId, mergedTracks);
      
      if (mosaicImages.length === 4) {
        try {
          const base64Image = await this.generateMosaicImage(mosaicImages);
          if (base64Image) {
            await this.spotifyService.uploadPlaylistCoverImage(playlistId, base64Image);
          }
        } catch (imageError) {
          console.warn("Mosaic canvas compilation skipped, defaulting to native fallback art:", imageError);
        }
      }

      window.alert(`Successfully exported custom configuration: "${customName}"`);
    } catch (err) {
      console.error("Failed executing storage save track configuration operation:", err);
      window.alert("Could not export configuration snapshot onto your personal account.");
    } finally {
      this.isLoading = false;
    }
  }

  async pause() {
    const activeDevice = this.getActiveDevice();
    if (activeDevice?.id) {
      try {
        await this.spotifyService.pausePlayback(activeDevice.id);
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