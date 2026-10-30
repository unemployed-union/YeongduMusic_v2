import type { LyricLine, LyricsDocument, LyricsProvider } from '@/types/lyrics';

const timestamp = /\[(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?\]/g;

export function parseLyrics(raw: string, provider: LyricsProvider): LyricsDocument {
  const rows = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const timed: { time: number; text: string }[] = [];
  const rawOffset = Number(raw.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0);
  const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
  for (const row of rows) {
    const matches = [...row.matchAll(timestamp)];
    if (!matches.length) {
      continue;
    }
    const text = row
      .replace(timestamp, '')
      .replace(/<\d+:\d{2}(?:\.\d+)?>/g, '')
      .trim();
    for (const match of matches) {
      const milliseconds =
        Number(match[1]) * 60000 +
        Number(match[2]) * 1000 +
        Number((match[3] ?? '').padEnd(3, '0'));
      timed.push({ time: Math.max(0, milliseconds - offset) / 1000, text });
    }
  }
  if (timed.some((line) => line.text)) {
    timed.sort((left, right) => left.time - right.time);
    const merged: LyricLine[] = [];
    for (const line of timed) {
      const previous = merged.at(-1);
      if (previous?.time === line.time) {
        if (line.text && !previous.text.split('\n').includes(line.text)) {
          previous.text = [previous.text, line.text].filter(Boolean).join('\n');
        }
      } else {
        merged.push({ ...line, id: `time-${line.time}` });
      }
    }
    return { provider, kind: 'synced', lines: merged };
  }
  const plain = rows
    .map((row) => row.replace(/\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]/gi, '').trim())
    .filter(Boolean);
  return {
    provider,
    kind: plain.length ? 'plain' : 'missing',
    lines: plain.map((text, index) => ({ id: `plain-${index}`, time: null, text })),
  };
}

// The playback engine position is the clock, including seek, pause and repeat.
export function activeLyricIndex(lines: readonly LyricLine[], position: number): number {
  if (!Number.isFinite(position)) {
    return -1;
  }
  let left = 0;
  let right = lines.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    const time = lines[middle].time;
    if (time !== null && time <= position) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  return left - 1;
}

export function demoLyrics(): LyricsDocument {
  return parseLyrics(
    '[00:00.00]잠시 귀를 기울여요\n[00:02.00]지금 흐르는 이 멜로디\n[00:04.00]작은 빛을 따라가요\n[00:06.00]우리만의 음악 속으로\n[00:08.00]다시 시작되는 순간',
    'demo',
  );
}
