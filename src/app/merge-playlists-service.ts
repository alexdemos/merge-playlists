import { Playlist } from './models/playlist';
import { Injectable } from '@angular/core';
import { Track } from './models/track';

@Injectable({
  providedIn: 'root'
})
export class MergePlaylistsService {

    mergePlaylists(playlists: Playlist[]): Track[]{
      let mergedTracks: Track[] = []
      let playlistTracks: Track[][] = []
      let copyTracks: Track[][] = []
      let playlistResets: number[] = [];
      for(const pl of playlists){
        playlistTracks.push(this.shuffleArray(pl.tracks))
        copyTracks.push(Array.from(pl.tracks))
        playlistResets.push(1)
      }

      let selector = 0
      while(this.sumArray(playlistResets) > 0){
        mergedTracks.push(playlistTracks[selector].pop()!)
        if(playlistTracks[selector].length == 0){
          playlistResets[selector] = Math.min(playlistResets[selector], 0);
          playlistTracks[selector] = Array.from(copyTracks[selector])
          playlistTracks[selector] = this.shuffleArray(playlistTracks[selector])
        }
        selector = (selector + 1) % playlists.length
      }
      return mergedTracks
    }

    sumArray(array: any[]): number{
      const total: number = array.reduce((sum, current) => sum + current, 0);
      return total
    }

  shuffleArray<T>(array: T[]): T[] {
    // Create a copy to avoid mutating the original array
    const shuffled = [...array]; 
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Pick a random index from 0 to i
      const j = Math.floor(Math.random() * (i + 1));
      
      // Swap elements at i and j using destructuring
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
}
}