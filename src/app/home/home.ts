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
  isLoading = false; // NEW: Processing animation controller flag
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
      if (this.selectedPlaylists.length < 4) {
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

    this.isLoading = true; // Turn loader on
    const deviceId = this.selectedDevice.id;
    this.devices.forEach(d => d.is_active = false);
    this.selectedDevice.is_active = true;

    try {
      if (this.playlistConfigChanged) {
        const mergedTracks = await this.getMergedTracks();
        
        if (mergedTracks.length === 0) {
          window.alert("No songs found to blend!");
          return;
        }

        if (mergedTracks.length > 100) {
          const userId = await this.spotifyService.getCurrentUserId();
          const tempPlaylist = await this.spotifyService.createPlaylist(userId, this.TEMP_PLAYLIST_NAME, "Temporary tracking container.");
          const playlistId = tempPlaylist.id;
          
          await this.spotifyService.overwritePlaylistTracks(playlistId, mergedTracks);
          const contextUri = `spotify:playlist:${playlistId}`;
          
          await this.spotifyService.startPlayback([], deviceId, contextUri);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.spotifyService.unfollowPlaylist(playlistId);
        } else {
          await this.spotifyService.startPlayback(mergedTracks, deviceId);
        }
        
        this.playlistConfigChanged = false; 
      } else {
        await this.spotifyService.resumePlayback(deviceId);
      }
    } catch (err) {
      console.error("Error inside playback execution pipeline:", err);
      window.alert("Playback failed to initiate correctly.");
    } finally {
      this.isLoading = false; // Turn loader off when finished or crashed
    }
  }

  // Helper to generate a 2x2 grid cover image from track artwork URLs
private generateMosaicImage(imageUrls: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // If we don't have enough distinct images for a grid, fallback to an empty string
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
    const images = imageUrls.slice(0, 4).map((url, index) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Crucial to prevent CORS "tainted canvas" security errors
      
      img.onload = () => {
        loadedCount++;
        // Determine x, y coordinates for a 2x2 grid (each square is 320x320)
        const x = (index % 2) * 320;
        const y = Math.floor(index / 2) * 320;
        ctx.drawImage(img, x, y, 320, 320);

        // Once all 4 corners are drawn, export as an optimized JPEG string
        if (loadedCount === 4) {
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // 0.7 quality keeps file size under 256 KB
        }
      };

      img.onerror = () => {
        reject(`Failed to load image asset for mosaic compile: ${url}`);
      };

      img.src = url;
      return img;
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
    
    // --- NEW: Gather cover art directly from the pinned Playlists ---
    const artworkUrls: string[] = [];
    
    // Loop through your selected playlists to extract their native cover art
    for (const playlist of this.selectedPlaylists) {
      if (playlist.images && playlist.images.length > 0) {
        // Spotify playlist images array: index 0 is usually the highest resolution
        const targetUrl = playlist.images[0].url;
        if (targetUrl && !artworkUrls.includes(targetUrl)) {
          artworkUrls.push(targetUrl);
        }
      }
    }

    // Fallback safely: If the user only blended 2 or 3 playlists, duplicate images 
    // to ensure we always have exactly 4 slots filled for a clean 2x2 canvas layout grid
    const finalArtworkUrls: string[] = [];
    if (artworkUrls.length > 0) {
      while (finalArtworkUrls.length < 4) {
        finalArtworkUrls.push(...artworkUrls);
      }
    }
    const mosaicImages = finalArtworkUrls.slice(0, 4);
    // -----------------------------------------------------------------

    // 1. Create the target playlist framework container
    const userId = await this.spotifyService.getCurrentUserId();
    const created = await this.spotifyService.createPlaylist(userId, customName, `Saved export blend containing: ${customName}`);
    const playlistId = created.id;

    // 2. Hydrate the track payload into the container
    await this.spotifyService.overwritePlaylistTracks(playlistId, mergedTracks);
    
    // 3. Compile and push the mosaic up to Spotify's servers
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