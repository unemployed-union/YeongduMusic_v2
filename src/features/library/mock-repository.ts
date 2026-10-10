import type { Album, Artist, MusicRepository, Page, PageRequest, Song } from '@/types/music';

const palettes: readonly (readonly [string, string])[] = [
  ['#CC5265', '#381C4C'], ['#F4A65C', '#8C3D66'], ['#4679B5', '#132A51'],
  ['#89BBA4', '#244B5A'], ['#D6B58A', '#6B4763'], ['#B474B4', '#3D275C'],
  ['#82B8C6', '#294A72'], ['#E46D66', '#562552'], ['#B0B86C', '#394F54'],
];
const artists = ['Yuna Park', 'The Low Tides', 'Mira', 'Atelier 9', 'Jonah', 'Sunday Drive', 'Hana Moon', 'Northline', 'Blue Hour'];
const titles = ['Afterglow', 'Soft Focus', 'Night Swim', 'Somewhere, Slowly', 'Still Here', 'Paper Skies', 'Little Moments', 'New Light', 'In Bloom'];
const songsByAlbum = [
  ['First Light', 'Window Seat', 'September Rain', 'Closer to Home', 'Afterglow'],
  ['Low Tide', 'Drift', 'Coastline', 'Saltwater', 'Breathe Again'],
  ['Blue Room', 'Stay a While', 'Quiet Streets', 'Mirrors', 'Last Train'],
  ['Opening', 'Small Hours', 'City Notes', 'Parallel', 'Homeward'],
  ['Worn Pages', 'Golden', 'Familiar Roads', 'For You', 'Interlude'],
  ['Sunday', 'Easy Does It', 'Open Road', 'Half Past Four', 'Sunset Drive'],
  ['Moonrise', 'Orbit', 'Silver Lining', 'Overture', 'Dreaming'],
  ['On the Line', 'Miles Away', 'Signal', 'Coming Back', 'Northbound'],
  ['Before Dawn', 'Blue Hour', 'We Were Here', 'Soft Landing', 'Daybreak'],
];

export const mockAlbums: Album[] = titles.map((title, index) => ({
  id: `mock-album-${index}`, title, artist: artists[index], year: 2024 - index % 4,
  palette: palettes[index], songCount: 5,
}));
export const mockArtists: Artist[] = artists.map((name, index) => ({ id: `mock-artist-${index}`, name, albumCount: 1 }));
export const mockSongs: Song[] = mockAlbums.flatMap((album, albumIndex) =>
  songsByAlbum[albumIndex].map((title, index) => ({
    id: `mock-song-${albumIndex}-${index}`, title, artist: album.artist, album: album.title,
    path: `/demo/music/${album.artist}/${album.title}/${index + 1}.wav`, albumId: album.id, duration: 182 + index * 19 + albumIndex * 3,
    trackNumber: index + 1, palette: album.palette,
  })),
);

function page<T>(items: T[], request: PageRequest): Page<T> {
  return { items: items.slice(request.offset, request.offset + request.limit), total: items.length };
}

export const mockRepository: MusicRepository = {
  async songs(request) { return page(mockSongs, request); },
  async albums(request) { return page(mockAlbums, request); },
  async artists(request) { return page(mockArtists, request); },

  async streamSource() { return { assetId: require('../../../assets/audio/mock-tone.wav') }; },
};
