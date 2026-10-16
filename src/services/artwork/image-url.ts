/** Keep list/palette thumbnails small; upgrade only the visible player's NAS cover. */
export function fullArtworkUrl(uri: string): string {
  try {
    const url = new URL(uri);
    if (!['https:', 'http:'].includes(url.protocol)
      || url.searchParams.get('api') !== 'SYNO.AudioStation.Cover'
      || url.searchParams.get('method') !== 'getsongcover') return uri;
    url.searchParams.set('size', '1024');
    return url.toString();
  } catch { return uri; }
}
