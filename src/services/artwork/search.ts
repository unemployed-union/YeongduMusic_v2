import { musicBrainzRequest } from '@/services/metadata/web-search';
import { CloudRequestError } from '@/services/cloud-music/request';

export type ArtworkCandidate = {
  id: string;
  album: string;
  artist: string;
  year: string;
  uri: string;
  score: number;
};
export function coverArtUrl(id: string): string {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    throw new CloudRequestError('앨범 정보를 확인할 수 없습니다.');
  }
  return `https://coverartarchive.org/release-group/${id}/front-500`;
}
export function parseArtworkCandidates(value: unknown): ArtworkCandidate[] {
  const data = value as { 'release-groups'?: unknown };
  if (!data || !Array.isArray(data['release-groups'])) {
    throw new CloudRequestError('앨범아트 검색 응답을 읽을 수 없습니다.');
  }
  const seen = new Set<string>();
  const result: ArtworkCandidate[] = [];
  for (const item of data['release-groups'].slice(0, 12)) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 300 ||
      !Array.isArray(item['artist-credit'])
    ) {
      continue;
    }
    try {
      const uri = coverArtUrl(item.id);
      const artist = item['artist-credit']
        .map(
          (
            credit: { name?: unknown; artist?: { name?: unknown }; joinphrase?: unknown } | null,
          ) => {
            const name = credit?.name ?? credit?.artist?.name;
            return (
              (typeof name === 'string' ? name : '') +
              (typeof credit?.joinphrase === 'string' ? credit.joinphrase : '')
            );
          },
        )
        .join('')
        .trim();
      if (!artist || artist.length > 300 || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      result.push({
        id: item.id,
        album: item.title.trim(),
        artist,
        year:
          typeof item['first-release-date'] === 'string'
            ? item['first-release-date'].slice(0, 4)
            : '',
        uri,
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
      });
    } catch {
      /* Ignore malformed identifiers instead of constructing arbitrary image URLs. */
    }
  }
  return result.sort((a, b) => b.score - a.score);
}
export function searchArtwork(
  album: string,
  artist: string,
  signal?: AbortSignal,
): Promise<ArtworkCandidate[]> {
  if (!album.trim() || album.length > 300 || !artist.trim() || artist.length > 300) {
    throw new CloudRequestError('검색할 앨범과 아티스트를 300자 이내로 입력해 주세요.');
  }
  const escape = (text: string) => text.trim().replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, '\\$1');
  const query = `releasegroup:"${escape(album)}" AND artist:"${escape(artist)}"`;
  return musicBrainzRequest(
    `https://musicbrainz.org/ws/2/release-group?fmt=json&limit=12&query=${encodeURIComponent(query)}`,
    parseArtworkCandidates,
    signal,
  );
}
