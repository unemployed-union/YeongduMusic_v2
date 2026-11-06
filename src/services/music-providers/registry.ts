import type { MusicProviderId, Song } from '@/types/music';
import type { MusicProvider, ProviderState } from './contracts';
import { synologyProvider } from './synology';
import { localProvider, driveProvider, s3Provider, myboxProvider } from './file-providers';
import { jellyfinProvider } from './jellyfin';

export const musicProviders: readonly MusicProvider[] = [
  synologyProvider,
  localProvider,
  driveProvider,
  s3Provider,
  myboxProvider,
  jellyfinProvider,
];
const registry = new Map(musicProviders.map((provider) => [provider.id, provider]));

export function musicProvider(id: MusicProviderId): MusicProvider {
  const provider = registry.get(id);
  if (!provider) {
    throw new Error('지원하지 않는 음악 서비스입니다.');
  }
  return provider;
}

export function providerForSong(song: Song): MusicProvider {
  return musicProvider(song.source ?? 'nas');
}

let snapshots: readonly ProviderState[] = [];
export function providerSnapshots(): readonly ProviderState[] {
  const next = musicProviders.map((provider) => provider.getState());
  if (next.some((state, index) => snapshots[index] !== state)) {
    snapshots = next;
  }
  return snapshots;
}

export function subscribeProviders(listener: () => void): () => void {
  const stops = musicProviders.map((provider) => provider.subscribe(listener));
  return () => stops.forEach((stop) => stop());
}
