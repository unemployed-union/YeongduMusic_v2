/** Resolve protected artwork only when a visible image/player needs it. */
export async function resolveArtworkUri(uri: string): Promise<string> {
  if (!uri.startsWith('jellyfin-artwork:')) {
    return uri;
  }
  const { artworkScope, resolveJellyfinArtwork } = await import('@/services/jellyfin/artwork');
  const { useJellyfinStore } = await import('@/stores/jellyfin');
  const client = useJellyfinStore.getState().client(artworkScope(uri) ?? undefined);
  const generation = useJellyfinStore.getState().generation;
  const result = await resolveJellyfinArtwork(uri, client);
  if (useJellyfinStore.getState().generation !== generation) {
    throw new Error('앨범 아트 요청이 취소되었습니다.');
  }
  return result;
}
