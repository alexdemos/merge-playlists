import { PlaylistItem } from './playlistItem';

export interface PlaylistItemResponse {
    items: PlaylistItem[]
    next: string
}