export const TRANSLATION_LANGUAGES = [
  { code: 'en', label: '영어' }, { code: 'ko', label: '한국어' }, { code: 'ja', label: '일본어' },
  { code: 'zh-CN', label: '중국어' }, { code: 'es', label: '스페인어' }, { code: 'fr', label: '프랑스어' },
  { code: 'de', label: '독일어' }, { code: 'ru', label: '러시아어' }, { code: 'pt', label: '포르투갈어' },
] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number]['code'];
export type TranslationOptions = { source: TranslationLanguage; target: TranslationLanguage };
export const DEFAULT_TRANSLATION_OPTIONS: TranslationOptions = { source: 'en', target: 'ko' };
export const translationLanguageName = (code: TranslationLanguage) => TRANSLATION_LANGUAGES.find(language => language.code === code)!.label;
export function parseTranslationOptions(value: unknown): TranslationOptions {
  if (!value || typeof value !== 'object') throw new Error('가사 번역 언어 설정을 확인할 수 없습니다.');
  const options = value as TranslationOptions;
  if (!TRANSLATION_LANGUAGES.some(language => language.code === options.source) || !TRANSLATION_LANGUAGES.some(language => language.code === options.target)) throw new Error('지원하는 번역 언어를 선택해 주세요.');
  if (options.source === options.target) throw new Error('원문 언어와 번역 언어를 다르게 선택해 주세요.');
  return { source: options.source, target: options.target };
}
