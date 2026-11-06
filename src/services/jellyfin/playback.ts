import { Platform } from 'react-native';
import type { PlaybackSource, Song, SourceRequest, StreamingQuality } from '@/types/music';
import { isLosslessSong } from '@/services/playback/lossless';
import { JellyfinClient, JellyfinError } from './api';

type MediaSource = {
  Id?: string;
  Container?: string;
  SupportsDirectPlay?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
};

export async function jellyfinPlaybackSource(
  client: JellyfinClient,
  song: Song,
  quality: StreamingQuality,
  options: SourceRequest = {},
): Promise<PlaybackSource> {
  if (song.source !== 'jellyfin' || !song.ref.remoteId) {
    throw new JellyfinError('Jellyfin 곡 정보를 확인할 수 없습니다.');
  }
  const requestedPosition = options.position ?? 0;
  if (!Number.isFinite(requestedPosition)) {
    throw new JellyfinError('재생 위치가 올바르지 않습니다.');
  }
  const position = Math.max(0, requestedPosition);
  const directProfiles = [
    { Type: 'Audio', Container: 'mp3', AudioCodec: 'mp3' },
    {
      Type: 'Audio',
      Container: 'm4a,mp4,aac',
      AudioCodec: Platform.OS === 'ios' ? 'aac,alac' : 'aac',
    },
    { Type: 'Audio', Container: 'flac', AudioCodec: 'flac' },
    { Type: 'Audio', Container: 'wav', AudioCodec: 'pcm_s16le,pcm_s24le' },
  ];
  if (Platform.OS === 'android') {
    directProfiles.push({ Type: 'Audio', Container: 'ogg,opus', AudioCodec: 'vorbis,opus' });
  }
  const result = await client.request<{
    MediaSources?: MediaSource[];
    PlaySessionId?: string;
    ErrorCode?: string;
  }>(`Items/${encodeURIComponent(song.ref.remoteId)}/PlaybackInfo`, {
    signal: options.signal,
    body: {
      UserId: client.session.userId,
      StartTimeTicks: Math.round(position * 10_000_000),
      IsPlayback: true,
      EnableDirectPlay: quality === 'original',
      EnableDirectStream: false,
      DeviceProfile: {
        Name: 'YeongduMusic',
        MaxStreamingBitrate: 140_000_000,
        DirectPlayProfiles: quality === 'original' ? directProfiles : [],
        TranscodingProfiles: [
          {
            Type: 'Audio',
            Container: 'mp3',
            AudioCodec: 'mp3',
            Protocol: 'http',
            Context: 'Streaming',
            MaxAudioChannels: '2',
            MinSegments: 1,
            BreakOnNonKeyFrames: false,
          },
        ],
      },
    },
  });
  const source =
    result.MediaSources?.find((item) => item.SupportsDirectPlay && quality === 'original') ??
    result.MediaSources?.find((item) => item.SupportsTranscoding && item.TranscodingUrl);
  if (!source?.Id || result.ErrorCode) {
    throw new JellyfinError(
      '이 음악을 재생할 수 없습니다. 서버의 음악 재생 및 트랜스코딩 권한을 확인해 주세요.',
    );
  }
  if (source.SupportsDirectPlay && quality === 'original') {
    return {
      uri: client.url(`Audio/${encodeURIComponent(song.ref.remoteId)}/stream`, {
        Static: true,
        MediaSourceId: source.Id,
      }),
      headers: client.headers(),
      lossless: isLosslessSong(song),
      seekMode: 'native',
      reloadOnError: true,
    };
  }
  if (!result.PlaySessionId) {
    throw new JellyfinError('트랜스코딩 세션을 확인할 수 없습니다.');
  }
  const url = new URL(source.TranscodingUrl!, client.session.baseUrl + '/');
  const base = new URL(client.session.baseUrl);
  if (
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.hash ||
    !(url.pathname + '/').startsWith(base.pathname.replace(/\/$/, '') + '/')
  ) {
    throw new JellyfinError(
      '트랜스코딩 주소가 설정한 Jellyfin 서버와 다릅니다. 프록시 Base URL을 확인해 주세요.',
    );
  }
  // Native playback receives credentials in headers, including range/reconnect requests.
  for (const key of [...url.searchParams.keys()]) {
    if (
      [
        'api_key',
        'apikey',
        'access_token',
        'starttimeticks',
        'audiobitrate',
        'playsessionid',
      ].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.set('startTimeTicks', String(Math.round(position * 10_000_000)));
  url.searchParams.set('audioBitRate', '320000');
  url.searchParams.set('playSessionId', result.PlaySessionId);
  let released = false;
  return {
    uri: url.toString(),
    headers: client.headers(),
    lossless: false,
    seekMode: 'reload',
    positionOffset: position,
    reloadOnError: true,
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      await client.request('Videos/ActiveEncodings', {
        method: 'DELETE',
        query: { DeviceId: client.session.deviceId, PlaySessionId: result.PlaySessionId },
      });
    },
  };
}
