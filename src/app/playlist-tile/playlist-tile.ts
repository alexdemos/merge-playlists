import { Component, input } from '@angular/core';
import { Playlist } from '../models/playlist';

@Component({
  selector: 'app-playlist-tile',
  imports: [],
  templateUrl: './playlist-tile.html',
  styleUrl: './playlist-tile.css'
})
export class PlaylistTile {
  playlist = input.required<Playlist>();
}
