import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { ImageColorsResult } from 'react-native-image-colors';
import { cloudRequest } from '@/services/cloud-music/request';
import { EXTRACTION_FALLBACK, gradientFromImageColors } from '@/features/playback/artwork-colors';

type ImageColorsModule = { getColors: (uri: string, config: { fallback: string; quality: 'low'; pixelSpacing: number }) => Promise<ImageColorsResult> };
export function readArtworkColors(uri: string, signal: AbortSignal) {
  return cloudRequest('앨범아트 색상', async requestSignal => {
    const module = Platform.OS === 'web' ? await import('react-native-image-colors') : requireOptionalNativeModule<ImageColorsModule>('ImageColors');
    if (!module || requestSignal.aborted) return null;
    const result = await module.getColors(uri, { fallback: EXTRACTION_FALLBACK, quality: 'low', pixelSpacing: 10 });
    return gradientFromImageColors(result);
  }, signal, undefined, 8000);
}
