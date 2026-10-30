import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { ImageColorsResult } from 'react-native-image-colors';
import { cloudRequest } from '@/services/cloud-music/request';
import {
  EXTRACTION_FALLBACK,
  gradientFromImageColors,
  type GradientColors,
} from '@/features/playback/artwork-colors';

type ImageColorsModule = {
  getColors: (
    uri: string,
    config: { fallback: string; quality: 'low'; pixelSpacing: number },
  ) => Promise<ImageColorsResult>;
};
// Memory only: remote artwork URLs can contain account/session credentials.
const cache = new Map<string, GradientColors | null>();
const pending = new Map<string, Promise<GradientColors | null>>();
export function cachedArtworkColors(uri: string): GradientColors | null | undefined {
  return cache.get(uri);
}
function extractColors(uri: string) {
  return cloudRequest(
    '앨범아트 색상',
    async (requestSignal) => {
      const module =
        Platform.OS === 'web'
          ? await import('react-native-image-colors')
          : requireOptionalNativeModule<ImageColorsModule>('ImageColors');
      if (!module || requestSignal.aborted) {
        return null;
      }
      const result = await module.getColors(uri, {
        fallback: EXTRACTION_FALLBACK,
        quality: 'low',
        pixelSpacing: 10,
      });
      return gradientFromImageColors(result);
    },
    undefined,
    undefined,
    8000,
  );
}
export function readArtworkColors(
  uri: string,
  signal: AbortSignal,
): Promise<GradientColors | null> {
  return cloudRequest(
    '앨범아트 색상',
    () => {
      const cached = cache.get(uri);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
      let work = pending.get(uri);
      if (!work) {
        work = extractColors(uri);
        pending.set(uri, work);
        // A canceled screen stops waiting; a shared extraction can still warm the cache.
        void work
          .then(
            (colors) => {
              if (cache.size >= 64) {
                cache.delete(cache.keys().next().value!);
              }
              cache.set(uri, colors);
            },
            () => {},
          )
          .finally(() => {
            if (pending.get(uri) === work) {
              pending.delete(uri);
            }
          });
      }
      return work;
    },
    signal,
    undefined,
    8000,
  );
}
