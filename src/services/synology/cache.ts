import { clearLibraryCache as clearProviderCache } from '@/services/music-providers/cache';
export { cachedPage, cachePage } from '@/services/music-providers/cache';

export function clearLibraryCache(): Promise<void> {
  return clearProviderCache('nas:');
}
