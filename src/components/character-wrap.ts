const BREAK = '\u200B';
const boundary = /[\s\u200B]/u;
const korean = /\p{Script=Hangul}/u;
const extension = /[\p{M}\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
const regional = /[\u{1F1E6}-\u{1F1FF}]/u;
const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function hangulType(code: number): 'L' | 'V' | 'T' | 'LV' | 'LVT' | null {
  if ((code >= 0x1100 && code <= 0x115f) || (code >= 0xa960 && code <= 0xa97c)) {
    return 'L';
  }
  if ((code >= 0x1160 && code <= 0x11a7) || (code >= 0xd7b0 && code <= 0xd7c6)) {
    return 'V';
  }
  if ((code >= 0x11a8 && code <= 0x11ff) || (code >= 0xd7cb && code <= 0xd7fb)) {
    return 'T';
  }
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 ? 'LVT' : 'LV';
  }
  return null;
}

/** Hermes may lack Intl.Segmenter; keep combining marks and joined emoji intact. */
function fallbackSegments(text: string): string[] {
  const parts: string[] = [];
  let previous = '';
  let regionalCount = 0;
  for (const char of text) {
    const before = previous ? hangulType(previous.codePointAt(0)!) : null;
    const next = hangulType(char.codePointAt(0)!);
    const hangul =
      (before === 'L' && (next === 'L' || next === 'V' || next === 'LV' || next === 'LVT')) ||
      ((before === 'LV' || before === 'V') && (next === 'V' || next === 'T')) ||
      ((before === 'LVT' || before === 'T') && next === 'T');
    const joined =
      parts.length > 0 &&
      (extension.test(char) ||
        char === '\u200D' ||
        previous === '\u200D' ||
        (previous === '\r' && char === '\n') ||
        hangul ||
        (regional.test(char) && regionalCount % 2 === 1));
    if (joined) {
      parts[parts.length - 1] += char;
    } else {
      parts.push(char);
    }
    regionalCount = regional.test(char) ? regionalCount + 1 : 0;
    previous = char;
  }
  return parts;
}

/** Allow character breaks around Hangul; leave other languages' word boundaries intact.
 * Display only: never use this for input or persisted data.
 */
export function characterWrap(text: string): string {
  if (!korean.test(text)) {
    return text;
  }
  const parts = segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : fallbackSegments(text);
  let output = '';
  let previous = '';
  for (const part of parts) {
    if (
      previous &&
      !boundary.test(previous) &&
      !boundary.test(part) &&
      (korean.test(previous) || korean.test(part))
    ) {
      output += BREAK;
    }
    output += part;
    previous = part;
  }
  return output;
}
