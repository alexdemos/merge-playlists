import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core'; // Add OnInit, PLATFORM_ID
import { isPlatformBrowser } from '@angular/common'; // Add this
import { SpotifyService } from '../spotify-service';
import { Playlist } from '../models/playlist';
import { Track } from '../models/track';
import { PlaylistTile } from '../playlist-tile/playlist-tile';
import { SpotifyAuthService } from '../authorization-service'; // Your auth service
import { MergePlaylistsService } from '../merge-playlists-service'
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  imports: [PlaylistTile, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  spotifyService: SpotifyService = inject(SpotifyService);
  mergeService: MergePlaylistsService = inject(MergePlaylistsService);
  
  // Change private to public (or protected) so home.html can read the signal
  public authService = inject(SpotifyAuthService);
  private platformId = inject(PLATFORM_ID);

  homeForm = new FormGroup({});
  searchedPlaylists: Playlist[] = [];
  selectedPlaylists: Playlist[] = [];

  ngOnInit() {
    // 2. Force the signal to read the actual browser storage on mount
    if (isPlatformBrowser(this.platformId)) {
      const hasToken = !!localStorage.getItem('spotify_access_token');
      this.authService.isLoggedIn.set(hasToken);
    }
  }

  searchPlaylists(query: string){    
    this.spotifyService.seachPlaylists(query)
    .then(data => {
        this.searchedPlaylists = data['playlists']['items'].filter((value: null) => value != null);
        })
    }  

  pinPlaylist(playlist: Playlist){
    if(!this.selectedPlaylists.includes(playlist)){
      if(this.selectedPlaylists.length < 2){
        this.selectedPlaylists.push(playlist);
        playlist.isSelected = true;
        this.homeForm.addControl(playlist.id, new FormControl(1));
      }
    } else {
      this.selectedPlaylists.splice(this.selectedPlaylists.indexOf(playlist),1);
      playlist.isSelected = false;
      this.homeForm.removeControl('p1');
    }
  }

  async setPlaylistSongs(){
    for(const playlist of this.selectedPlaylists){
      let songs: Track[] = [];
      const data = await this.spotifyService.getPlaylistSongs(playlist);
      playlist.tracks = [...data];
    }
  }

  login() {
    this.authService.login(); // Handled completely by the service redirect now
  }

  logout(){
    this.authService.logout(); // Triggers the clean logic we added earlier
  }

  async play(){
    const userConfirmed = window.confirm(
      "This will create a private 'My Playlist Blender Cache' playlist in your Spotify account. Proceed?"
    );
    const ratios = this.homeForm.value as Record<string, any>;
    this.selectedPlaylists.forEach(playlist => {
      const inputValue = ratios[playlist.id];
      console.log(`Playlist ${playlist.name} has value: ${inputValue}`);
    });
    await this.setPlaylistSongs();
    let mergedTracks: Track[] = this.mergeService.mergePlaylists(this.selectedPlaylists);
    let firstHundred = mergedTracks.slice(0,100); //100 songs cap on playback
    //TODO: create a playlist
    this.spotifyService.startPlayback(firstHundred);
  }
}