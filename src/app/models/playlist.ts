import { Image } from "./image"
import { PlaylistItem } from "./playlistItem"
import { Track } from "./track"

export class Playlist {
    description: string = ""
    href: string = ""
    id: string = ""
    name: string = ""
    uri: string = ""
    images: Image[] = []
    tracks: Track[] = []
    items: PlaylistItem[] = []
    isSelected: boolean = false
    ratio: number = 1
}
