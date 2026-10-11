export type LyricsProvider = 'nas' | 'lrclib' | 'demo';
export type LyricsSource = 'auto' | 'nas' | 'online';
export type LyricLine = { id: string; time: number | null; text: string };
export type LyricsDocument = {
  provider: LyricsProvider;
  kind: 'synced' | 'plain' | 'instrumental' | 'missing';
  lines: LyricLine[];
};
