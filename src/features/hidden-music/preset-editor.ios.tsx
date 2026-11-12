import {
  SettingsFeedback,
  SettingsNote,
  SettingsPicker,
  SettingsToggle,
} from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { ToastNotice } from '@/components/toast-notice';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useColors } from '@/theme/tokens';
import { Button, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  disabled as unavailable,
} from '@expo/ui/swift-ui/modifiers';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { folderNavigationRows, indexFolderTree, parentFolderPath } from './folder-navigation';
import { usePresetEditor, type PresetEditorProps } from './use-preset-editor';

export function PresetEditor(props: PresetEditorProps) {
  const state = usePresetEditor(props.preset, props.songs);
  const colors = useColors();
  const { presetFolder } = useLocalSearchParams<{ presetFolder?: string }>();
  const currentPath = typeof presetFolder === 'string' ? presetFolder : '';
  const index = useMemo(() => indexFolderTree(state.tree), [state.tree]);
  const folderRows = useMemo(
    () =>
      folderNavigationRows(
        state.tree,
        index,
        currentPath,
        state.selectedFolders,
        state.term,
        state.selectedOnly,
      ).map((row) => ({ kind: 'folder' as const, ...row })),
    [state.tree, index, currentPath, state.selectedFolders, state.term, state.selectedOnly],
  );
  const choices = state.tab === 'folder' ? folderRows : state.choices;
  const pageKey = JSON.stringify([currentPath, state.tab, state.term, state.selectedOnly]);
  const [page, setPage] = useState({ key: pageKey, count: 100 });
  const visibleCount = page.key === pageKey ? page.count : 100;
  const folderName = currentPath.split('/').filter(Boolean).at(-1) ?? '폴더';
  const listTitle = state.tab === 'folder' ? folderName : '곡';
  const canGoBack = state.tab === 'folder' && !!currentPath;
  function browse(path: string) {
    if (props.busy) {
      return;
    }
    state.setTerm('');
    state.setSelectedOnly(false);
    router.setParams({ presetFolder: path || undefined });
  }
  let emptyMessage = '하위 폴더가 없습니다.';
  if (state.term.trim()) {
    emptyMessage = '검색 결과가 없습니다.';
  } else if (state.selectedOnly) {
    emptyMessage = '선택한 항목이 없습니다.';
  } else if (currentPath && !index.has(currentPath)) {
    emptyMessage = '현재 라이브러리에서 이 폴더를 찾을 수 없습니다. 상위 폴더로 돌아가 주세요.';
  } else if (state.tab === 'song') {
    emptyMessage = '선택할 곡이 없습니다.';
  } else if (!currentPath) {
    emptyMessage = '음악이 있는 폴더가 없습니다.';
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '음악 숨기기', headerBackVisible: false }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          hidesSharedBackground
          tintColor={colors.tint}
          disabled={props.busy}
          onPress={props.onCancel}
        >
          취소
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.tint}
          disabled={props.busy}
          accessibilityLabel="프리셋 저장"
          onPress={() =>
            props.onSave({
              ...props.preset,
              name: state.name,
              songIds: state.songIds,
              folders: state.folders,
            })
          }
        >
          저장
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <SettingsPage
        key={JSON.stringify([state.tab, currentPath])}
        systemAppearance
        overlay={props.error ? <ToastNotice message={props.error} /> : undefined}
      >
        <SettingsSection title="프리셋 이름" nativeContent systemAppearance>
          <SettingsField
            label="프리셋 이름"
            layout="plain"
            placeholder="예: 개인 음악"
            value={state.name}
            onChange={state.setName}
            disabled={props.busy}
            maxLength={60}
          />
        </SettingsSection>
        <SettingsSection
          title="선택할 항목"
          nativeContent
          systemAppearance
          description={[
            `선택한 폴더 ${state.folders.length}개 · 곡 ${state.songIds.length}개`,
            state.tab === 'folder'
              ? '폴더를 눌러 탐색하고 오른쪽 원으로 선택하세요. 하위 폴더와 나중에 추가되는 곡도 숨깁니다.'
              : '선택한 곡만 숨깁니다. 폴더 선택과 함께 사용할 수 있습니다.',
            props.preset.enabled
              ? '저장하면 바로 적용됩니다.'
              : '저장 후 프리셋을 켜면 적용됩니다.',
          ].join('\n')}
        >
          <SettingsPicker
            label="선택할 항목"
            style="segmented"
            value={state.tab}
            options={[
              { value: 'folder', label: '폴더' },
              { value: 'song', label: '곡' },
            ]}
            disabled={props.busy}
            onChange={(tab) => {
              state.setTab(tab);
              state.setTerm('');
            }}
          />
        </SettingsSection>
        {(props.busy || props.error) && (
          <SettingsSection title="저장 상태" nativeContent systemAppearance>
            <SettingsFeedback loading={props.busy} error={props.error} />
          </SettingsSection>
        )}
        <SettingsSection title="목록 필터" nativeContent systemAppearance>
          <SettingsField
            label={state.tab === 'folder' ? '전체 폴더 경로 검색' : '제목·아티스트·앨범 검색'}
            layout="plain"
            value={state.term}
            onChange={state.setTerm}
            disabled={props.busy}
          />
          <SettingsToggle
            label="선택한 항목만 보기"
            value={state.selectedOnly}
            disabled={props.busy}
            onChange={state.setSelectedOnly}
          />
        </SettingsSection>
        {(props.libraryLoading || props.libraryError || props.libraryStale) && (
          <SettingsSection title="라이브러리 상태" nativeContent systemAppearance>
            {props.libraryStale && (
              <SettingsNote>저장된 라이브러리를 표시하고 있습니다.</SettingsNote>
            )}
            <SettingsFeedback
              loading={props.libraryLoading}
              error={props.libraryError}
              disabled={props.busy || props.libraryLoading}
              onRetry={props.onRetryLibrary}
            />
          </SettingsSection>
        )}
        <SettingsSection
          title={state.tab === 'folder' && state.filtering ? '전체 폴더 검색 결과' : listTitle}
          nativeContent
          systemAppearance
          description={
            state.tab === 'folder' ? currentPath || '음악이 있는 최상위 폴더' : undefined
          }
        >
          {canGoBack && (
            <Button
              modifiers={[
                buttonStyle('borderless'),
                unavailable(props.busy),
                accessibilityLabel('상위 폴더로 이동'),
              ]}
              onPress={() => browse(parentFolderPath(currentPath))}
            >
              <HStack spacing={12} modifiers={[frame({ minHeight: 44, maxWidth: Infinity, alignment: 'leading' })]}>
                <Image systemName="folder" modifiers={[foregroundStyle(colors.muted)]} />
                <Text modifiers={[foregroundStyle(colors.text), font({ textStyle: 'body' })]}>...</Text>
              </HStack>
            </Button>
          )}
          {choices.slice(0, visibleCount).map((choice) => {
            const isFolder = choice.kind === 'folder';
            const key = isFolder ? choice.path : choice.song.id;
            const selected = isFolder
              ? state.selectedFolders.has(choice.path)
              : state.selectedSongs.has(choice.song.id);
            const label = isFolder ? choice.name : choice.song.title;
            const detail = isFolder
              ? choice.path.split('/').filter(Boolean).join(' › ')
              : [choice.song.artist, choice.song.album].filter(Boolean).join(' · ');
            const selectionLabel = `${isFolder ? choice.path : `${label} · ${detail}`}, ${selected ? '선택됨' : '선택 안 됨'}${isFolder && choice.coveredByParent ? ', 상위 폴더에 포함됨' : ''}`;
            return (
              <HStack key={key} spacing={8}>
                <Button
                  modifiers={[
                    buttonStyle('borderless'),
                    frame({ maxWidth: Infinity, alignment: 'leading' }),
                    unavailable(props.busy),
                    accessibilityLabel(isFolder ? `${choice.path} 폴더 열기` : selectionLabel),
                  ]}
                  onPress={() => {
                    if (props.busy) {
                      return;
                    }
                    if (isFolder) {
                      browse(choice.path);
                    } else {
                      state.toggle(choice);
                    }
                  }}
                >
                  <HStack spacing={12} modifiers={[frame({ minHeight: 44, maxWidth: Infinity })]}>
                    <Image
                      systemName={isFolder ? 'folder' : 'music.note'}
                      modifiers={[foregroundStyle(colors.muted)]}
                    />
                    <VStack
                      alignment="leading"
                      spacing={4}
                      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
                    >
                      <Text
                        modifiers={[
                          foregroundStyle(colors.text),
                          font({ textStyle: 'body' }),
                          lineLimit(2),
                        ]}
                      >
                        {label}
                      </Text>
                      {detail && (!isFolder || state.filtering) && (
                        <Text
                          modifiers={[
                            foregroundStyle(colors.muted),
                            font({ textStyle: 'caption' }),
                            lineLimit(2),
                          ]}
                        >
                          {detail}
                        </Text>
                      )}
                      {isFolder && (
                        <Text
                          modifiers={[
                            font({ textStyle: 'footnote' }),
                            foregroundStyle(colors.muted),
                          ]}
                        >
                          {choice.count
                            ? `${choice.count}곡${choice.coveredByParent ? ' · 상위 폴더에 포함됨' : ''}`
                            : `현재 라이브러리에 곡 없음${choice.coveredByParent ? ' · 상위 폴더에 포함됨' : ''}`}
                        </Text>
                      )}
                    </VStack>
                    {isFolder && choice.hasChildren && (
                      <Image
                        systemName="chevron.forward"
                        modifiers={[
                          font({ textStyle: 'footnote', weight: 'semibold' }),
                          foregroundStyle(colors.muted),
                        ]}
                      />
                    )}
                    {!isFolder && (
                      <Image
                        systemName={selected ? 'checkmark.circle.fill' : 'circle'}
                        modifiers={[
                          font({ textStyle: 'title3' }),
                          foregroundStyle(selected ? colors.tint : colors.muted),
                        ]}
                      />
                    )}
                  </HStack>
                </Button>
                {isFolder && (
                  <Button
                    modifiers={[
                      buttonStyle('borderless'),
                      frame({ minWidth: 44, minHeight: 44 }),
                      unavailable(props.busy),
                      accessibilityLabel(selectionLabel),
                    ]}
                    onPress={() => {
                      if (!props.busy) {
                        state.toggle(choice);
                      }
                    }}
                  >
                    <Image
                      systemName={selected ? 'checkmark.circle.fill' : 'circle'}
                      modifiers={[
                        font({ textStyle: 'title3' }),
                        foregroundStyle(selected ? colors.tint : colors.muted),
                      ]}
                    />
                  </Button>
                )}
              </HStack>
            );
          })}
          {choices.length > visibleCount && (
            <Button
              label="더 보기"
              modifiers={[unavailable(props.busy)]}
              onPress={() => setPage({ key: pageKey, count: visibleCount + 100 })}
            />
          )}
          {!choices.length && <SettingsNote>{emptyMessage}</SettingsNote>}
        </SettingsSection>
      </SettingsPage>
    </View>
  );
}
