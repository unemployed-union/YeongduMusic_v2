import { SettingsFeedback, SettingsPicker, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsNativeContent } from '@/features/settings/settings-ui';
import { useLyricsTranslationStore } from '@/stores/lyrics-translation';
import { Group } from '@expo/ui/swift-ui';
import { useEffect } from 'react';
import {
  TRANSLATION_LANGUAGES,
  withTranslationLanguage,
  type TranslationOptions,
} from './translation-options';
import type { TranslationLanguageControlsProps } from './translation-settings';

export function TranslationLanguageControls({
  options,
  disabled,
  busy = false,
  onChange,
}: TranslationLanguageControlsProps) {
  // The player also uses this control, so it may need a native Host outside a settings Form.
  return (
    <SettingsNativeContent>
      <LanguagePickers options={options} disabled={disabled || busy} onChange={onChange} />
    </SettingsNativeContent>
  );
}

function LanguagePickers({
  options,
  disabled,
  onChange,
}: {
  options: TranslationOptions;
  disabled: boolean;
  onChange: (options: TranslationOptions) => void;
}) {
  return (
    <Group>
      {(['source', 'target'] as const).map((field) => (
        <SettingsPicker
          key={field}
          label={field === 'source' ? '원문 언어' : '번역 언어'}
          value={options[field]}
          disabled={disabled}
          options={TRANSLATION_LANGUAGES.map((language) => ({
            value: language.code,
            label: language.label,
            disabled: field === 'target' && language.code === options.source,
          }))}
          onChange={(language) => onChange(withTranslationLanguage(options, field, language))}
        />
      ))}
    </Group>
  );
}

export function LyricsTranslationSettings() {
  const state = useLyricsTranslationStore();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <Group>
      <SettingsToggle
        label="가사 번역 사용"
        value={state.enabled}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setEnabled(value).catch(() => {});
        }}
      />
      {state.enabled && (
        <LanguagePickers
          options={state.options}
          disabled={disabled || state.saving}
          onChange={(options) => {
            void state.save(options).catch(() => {});
          }}
        />
      )}
      <SettingsFeedback
        loading={state.loading}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={
          state.loadError
            ? () => {
                void load(true);
              }
            : undefined
        }
      />
    </Group>
  );
}
