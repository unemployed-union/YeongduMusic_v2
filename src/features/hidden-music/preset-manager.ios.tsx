import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useColors } from '@/theme/tokens';
import { Button, DisclosureGroup, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  disabled as unavailable,
} from '@expo/ui/swift-ui/modifiers';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { PresetEditor } from './preset-editor';
import { usePresetManager } from './use-preset-manager';

export function PresetManager() {
  const state = usePresetManager();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [expandedPresets, setExpandedPresets] = useState<Set<string>>(() => new Set());
  if (state.draft) {
    return (
      <PresetEditor
        key={state.draft.id}
        preset={state.draft}
        songs={state.songs ?? []}
        busy={state.busy}
        error={state.message ?? state.error}
        libraryLoading={state.query.isPending || state.query.isRefetching}
        libraryError={state.query.isError ? state.query.error.message : null}
        libraryStale={state.query.data?.stale}
        onRetryLibrary={() => {
          void state.query.refetch();
        }}
        onCancel={() => {
          state.setDraft(null);
          state.setMessage(null);
          router.setParams({ presetFolder: undefined });
        }}
        onSave={(preset) => {
          void state.run(
            () => state.savePreset(preset),
            () => {
              state.setDraft(null);
              router.setParams({ presetFolder: undefined });
            },
          );
        }}
      />
    );
  }
  const blocked =
    state.busy ||
    (state.query.isPending && !state.query.data) ||
    (state.query.isError && !state.query.data);
  const hasPresets = state.profile.presets.length > 0;
  const matching = state.profile.presets.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const error = state.message ?? state.error;
  return (
    <>
      <Stack.Screen options={{ title: '음악 숨기기', headerBackVisible: true }} />
      <SettingsPage systemAppearance>
        <SettingsSection
          title="개인정보 보호"
          nativeContent
          systemAppearance
          description="생체 인증 또는 기기 암호로 엽니다. 화면을 나가면 다시 잠깁니다."
        >
          <SettingsToggle
            label="설정 잠금"
            value={state.profile.biometricLock}
            disabled={state.busy}
            onChange={(value) => {
              void state.run(() => state.setBiometricLock(value));
            }}
          />
        </SettingsSection>
        <SettingsSection
          title="숨김 프리셋"
          nativeContent
          systemAppearance
          description={
            hasPresets
              ? `현재 숨긴 곡 ${state.hiddenCount}개 · 여러 프리셋을 함께 적용할 수 있습니다.`
              : undefined
          }
        >
          {hasPresets ? (
            <SettingsField label="프리셋 검색" layout="plain" value={search} onChange={setSearch} />
          ) : (
            <VStack
              spacing={8}
              modifiers={[frame({ maxWidth: Infinity }), multilineTextAlignment('center')]}
            >
              <Image
                systemName="eye.slash"
                modifiers={[
                  font({ textStyle: 'title' }),
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                ]}
              />
              <Text modifiers={[font({ textStyle: 'headline' })]}>아직 프리셋이 없습니다</Text>
              <SettingsNote>숨길 폴더와 곡을 프리셋으로 모아 보세요.</SettingsNote>
            </VStack>
          )}
          {matching.slice(0, 100).map((preset) => (
            <DisclosureGroup
              key={preset.id}
              label={`${preset.name}${preset.enabled ? ' · 적용 중' : ''}`}
              isExpanded={expandedPresets.has(preset.id)}
              onIsExpandedChange={(expanded) => {
                setExpandedPresets((current) => {
                  const next = new Set(current);
                  if (expanded) {
                    next.add(preset.id);
                  } else {
                    next.delete(preset.id);
                  }
                  return next;
                });
              }}
            >
              <SettingsToggle
                label="프리셋 적용"
                value={preset.enabled}
                disabled={blocked}
                onChange={() => {
                  void state.run(() => state.togglePreset(preset.id));
                }}
              />
              <SettingsNote>{`폴더 ${preset.folders.length}개 · 곡 ${preset.songIds.length}개`}</SettingsNote>
              <Button
                label="프리셋 편집"
                modifiers={[unavailable(blocked), foregroundStyle(colors.tint)]}
                onPress={() => {
                  router.setParams({ presetFolder: undefined });
                  state.setMessage(null);
                  state.setDraft({
                    ...preset,
                    songIds: [...preset.songIds],
                    folders: [...preset.folders],
                  });
                }}
              />
              <Button
                label="삭제"
                role="destructive"
                modifiers={[unavailable(blocked)]}
                onPress={() => state.remove(preset)}
              />
            </DisclosureGroup>
          ))}
          {hasPresets && !matching.length && <SettingsNote>검색 결과가 없습니다.</SettingsNote>}
          {matching.length > 100 && (
            <SettingsNote>처음 100개를 표시합니다. 검색으로 범위를 좁혀 주세요.</SettingsNote>
          )}
        </SettingsSection>
        <SettingsSection
          title="새 프리셋"
          nativeContent
          systemAppearance
          description="원본 파일은 변경하거나 삭제하지 않습니다."
        >
          <Button
            label="프리셋 만들기"
            systemImage="plus"
            modifiers={[unavailable(blocked), foregroundStyle(colors.tint)]}
            onPress={() => {
              router.setParams({ presetFolder: undefined });
              state.setMessage(null);
              state.setDraft({
                id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
                name: '',
                enabled: true,
                songIds: [],
                folders: [],
              });
            }}
          />
        </SettingsSection>
        {(error || state.query.isPending || state.query.isRefetching || state.query.isError) && (
          <SettingsSection title="상태" nativeContent systemAppearance>
            <SettingsFeedback error={error} />
            <SettingsFeedback
              loading={state.query.isPending || state.query.isRefetching}
              error={state.query.isError ? state.query.error.message : null}
              onRetry={() => {
                void state.query.refetch();
              }}
            />
          </SettingsSection>
        )}
      </SettingsPage>
    </>
  );
}
