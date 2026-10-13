const BREAK = '\u200B';
const boundary = /[\s\u200B]/u;
const extension = /[\p{M}\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
const regional = /[\u{1F1E6}-\u{1F1FF}]/u;
const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function hangulType(code: number): 'L' | 'V' | 'T' | 'LV' | 'LVT' | null {
  if (code >= 0x1100 && code <= 0x115F || code >= 0xA960 && code <= 0xA97C) return 'L';
  if (code >= 0x1160 && code <= 0x11A7 || code >= 0xD7B0 && code <= 0xD7C6) return 'V';
  if (code >= 0x11A8 && code <= 0x11FF || code >= 0xD7CB && code <= 0xD7FB) return 'T';
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 ? 'LVT' : 'LV';
  return null;
}

/** Hermes may lack Intl.Segmenter; keep combining marks and joined emoji intact. */
function fallbackSegments(text: string): string[] {
  const parts: string[] = [];
  let previous = '', regionalCount = 0;
  for (const char of text) {
    const before = previous ? hangulType(previous.codePointAt(0)!) : null, next = hangulType(char.codePointAt(0)!);
    const hangul = before === 'L' && (next === 'L' || next === 'V' || next === 'LV' || next === 'LVT')
      || (before === 'LV' || before === 'V') && (next === 'V' || next === 'T')
      || (before === 'LVT' || before === 'T') && next === 'T';
    const joined = parts.length > 0 && (extension.test(char) || char === '\u200D' || previous === '\u200D'
      || previous === '\r' && char === '\n' || hangul || regional.test(char) && regionalCount % 2 === 1);
    if (joined) parts[parts.length - 1] += char;
    else parts.push(char);
    regionalCount = regional.test(char) ? regionalCount + 1 : 0;
    previous = char;
  }
  return parts;
}

/** Display-only break opportunities. Never use this for input or persisted data. */
export function characterWrap(text: string): string {
  const parts = segmenter ? Array.from(segmenter.segment(text), part => part.segment) : fallbackSegments(text);
  let output = '', previous = '';
  for (const part of parts) {
    if (previous && !boundary.test(previous) && !boundary.test(part)) output += BREAK;
    output += part;
    previous = part;
  }
  return output;
}
