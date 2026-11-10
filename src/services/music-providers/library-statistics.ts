import type { MusicProviderId } from '@/types/music';

type Sample = { provider: MusicProviderId; reason: string; kind: string; duration: number; success: boolean };
const samples: Sample[] = [];

export function recordLibraryRequest(sample: Sample): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }
  samples.push(sample);
  if (samples.length > 200) {
    samples.shift();
  }
  console.info('[library-sync]', sample);
}

export function libraryRequestStatistics(): readonly Sample[] {
  return samples.slice();
}
