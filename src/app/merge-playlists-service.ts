import { Playlist } from './models/playlist';
import { Injectable } from '@angular/core';
import { Track } from './models/track';

@Injectable({
  providedIn: 'root'
})
export class MergePlaylistsService {

  mergePlaylists(playlists: Playlist[]): Track[] {
    if (!playlists || playlists.length === 0) return [];

    const mergedTracks: Track[] = [];
    
    // 1. Use map for clean, modern initialization
    const playlistTracks: Track[][] = playlists.map(pl => this.shuffleArray(pl.tracks));
    const playlistResets: number[] = new Array(playlists.length).fill(1);
    const originalRatios: number[] = playlists.map(pl => pl.ratio);
    const ratios: number[] = [...originalRatios];

    // 2. Performance counters to turn O(N) array sums into O(1) checks
    let remainingResets = playlists.length;
    const totalRatioSum = originalRatios.reduce((sum, r) => sum + r, 0);
    let currentRatioSum = totalRatioSum;

    // If all playlists are empty initially, prevent infinite loop
    if (totalRatioSum === 0) return []; 

    while (remainingResets > 0) {
      const selector = this.updateSelector(ratios);
      
      // Reset ratios in-place when the batch quota finishes
      currentRatioSum--;
      if (currentRatioSum === 0) {
        for (let i = 0; i < ratios.length; i++) {
          ratios[i] = originalRatios[i];
        }
        currentRatioSum = totalRatioSum;
      }

      // Add song safely (guard against empty playlists)
      const track = playlistTracks[selector].pop();
      if (track) {
        mergedTracks.push(track);
      }

      // Handle empty playlist states
      if (playlistTracks[selector].length === 0) {
        if (playlistResets[selector] === 1) {
          playlistResets[selector] = 0;
          remainingResets--; // O(1) decrement replaces O(N) sumArray scan
        }
        
        // 3. Directly shuffle from the source configuration to save allocations
        playlistTracks[selector] = this.shuffleArray(playlists[selector].tracks);
      }
    }
    
    return mergedTracks;
  }

  // Cleaned up dead parameters (originalRatios and playlists weren't being used)
  private updateSelector(ratios: number[]): number {
    let max = -1;
    let max_index = -1;
    
    for (let i = 0; i < ratios.length; i++) {
      const ratio = ratios[i];
      if (ratio >= max) {
        max = ratio;
        max_index = i;
      }
    }
    
    ratios[max_index] -= 1;
    return max_index;
  }

  shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; 
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}