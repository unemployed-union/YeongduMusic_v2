import { CloudRequestError, cloudRequest } from '@/services/cloud-music/request';
import {
  parseTranslationOptions,
  type TranslationOptions,
} from '@/features/lyrics/translation-options';
import type { LyricsDocument } from '@/types/lyrics';

export type TranslatedLyrics = Record<string, string>;
/** MyMemory accepts at most 500 UTF-8 bytes, rather than 500 JS characters. */
export function translationChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const row of text.replace(/\r\n?/g, '\n').split('\n')) {
    let remaining = row.trim();
    while (remaining) {
      let size = 0;
      let end = 0;
      let space = -1;
      for (const character of remaining) {
        const code = character.codePointAt(0)!;
        let bytes: 1 | 4 | 3 | 2;
        if (code > 0xffff) {
          bytes = 4;
        } else if (code > 0x7ff) {
          bytes = 3;
        } else if (code > 0x7f) {
          bytes = 2;
        } else {
          bytes = 1;
        }

        if (size + bytes > 450) {
          break;
        }
        size += bytes;
        end += character.length;
        if (/\s/.test(character)) {
          space = end;
        }
      }
      if (end < remaining.length && space > 0) {
        end = space;
      }
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
  }
  return chunks;
}
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity: string) => {
    if (!entity.startsWith('#')) {
      return named[entity.toLowerCase()] ?? raw;
    }
    const code =
      entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : raw;
  });
}
export function parseTranslationResponse(value: unknown): string {
  if (!value || typeof value !== 'object') {
    throw new CloudRequestError('번역 응답을 읽을 수 없습니다.');
  }
  const data = value as {
    responseStatus?: unknown;
    quotaFinished?: unknown;
    responseData?: { translatedText?: unknown };
  };
  const status = Number(data.responseStatus);
  if (data.quotaFinished === true || status === 429 || status === 403) {
    throw new CloudRequestError(
      '번역 서비스의 사용 한도에 도달했습니다. 나중에 다시 시도해 주세요.',
      status,
    );
  }
  if (status !== 200) {
    throw new CloudRequestError(
      '번역을 완료하지 못했습니다. 원문 언어를 확인한 뒤 다시 시도해 주세요.',
      status,
    );
  }
  const text = data.responseData?.translatedText;
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) {
    throw new CloudRequestError('번역 응답을 읽을 수 없습니다.');
  }
  return decodeEntities(text).trim();
}
const cache = new Map<string, string>();
let requests: Promise<unknown> = Promise.resolve();
function requestTranslation(
  text: string,
  options: TranslationOptions,
  signal: AbortSignal,
): Promise<string> {
  const key = JSON.stringify([options.source, options.target, text]);
  const operation = requests.then(async () => {
    if (signal.aborted) {
      throw new CloudRequestError('가사 번역 요청이 취소되었습니다.');
    }
    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const result = await cloudRequest(
      '가사 번역',
      async (requestSignal) => {
        const params = new URLSearchParams({
          q: text,
          langpair: `${options.source}|${options.target}`,
          mt: '1',
        });
        const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
          signal: requestSignal,
          headers: { Accept: 'application/json' },
        });
        if (response.status === 429 || response.status === 403) {
          throw new CloudRequestError(
            '번역 서비스의 사용 한도에 도달했습니다. 나중에 다시 시도해 주세요.',
            response.status,
          );
        }
        if (!response.ok) {
          throw new CloudRequestError(
            '번역 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            response.status,
          );
        }
        const raw = await response.text();
        if (raw.length > 100000) {
          throw new CloudRequestError('번역 응답이 너무 큽니다.');
        }
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          throw new CloudRequestError('번역 응답을 읽을 수 없습니다.');
        }
        return parseTranslationResponse(value);
      },
      signal,
    );
    if (result !== text) {
      cache.set(key, result);
      if (cache.size > 500) {
        cache.delete(cache.keys().next().value!);
      }
    }
    return result;
  });
  requests = operation.catch(() => {});
  return operation;
}
/** No LRC timestamps, music files, song IDs or storage credentials reach the service. */
export async function translateLyrics(
  document: LyricsDocument,
  input: TranslationOptions,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => void,
): Promise<TranslatedLyrics> {
  const options = parseTranslationOptions(input);
  if (
    !['synced', 'plain'].includes(document.kind) ||
    !document.lines.some((line) => line.text.trim())
  ) {
    throw new CloudRequestError('번역할 가사가 없습니다.');
  }
  const text = document.lines.map((line) => line.text).join('\n');
  if (text.length > 20000 || document.lines.length > 500) {
    throw new CloudRequestError('가사가 너무 길어 한 번에 번역할 수 없습니다.');
  }
  const segments = document.lines.map((line) => ({
    id: line.id,
    chunks: translationChunks(line.text),
  }));
  const unique = [...new Set(segments.flatMap((line) => line.chunks))];
  if (unique.length > 200) {
    throw new CloudRequestError('가사가 너무 길어 한 번에 번역할 수 없습니다.');
  }
  return cloudRequest(
    '가사 번역',
    async (operationSignal) => {
      const translated = new Map<string, string>();
      progress?.(0, unique.length);
      for (const chunk of unique) {
        translated.set(chunk, await requestTranslation(chunk, options, operationSignal));
        if (operationSignal.aborted) {
          throw new CloudRequestError('가사 번역 요청이 취소되었습니다.');
        }
        progress?.(translated.size, unique.length);
      }
      const normalize = (value: string) =>
        value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (unique.every((chunk) => normalize(translated.get(chunk)!) === normalize(chunk))) {
        throw new CloudRequestError(
          '번역 서비스가 원문과 같은 내용만 반환했습니다. 원문 언어를 확인하거나 나중에 다시 시도해 주세요.',
        );
      }
      return Object.fromEntries(
        segments.map((line) => [
          line.id,
          line.chunks.map((chunk) => translated.get(chunk)!).join('\n'),
        ]),
      );
    },
    signal,
    undefined,
    120000,
  );
}
