import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { Button, DisclosureGroup, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { useFolderExclusionSettings } from './use-folder-exclusion-settings';

export function FolderExclusionSettings() {
  const state = useFolderExclusionSettings();
  return (
    <DisclosureGroup
      label={`기기 음악 제외 폴더 · ${state.exclusions.folders.length}개`}
      isExpanded={state.open}
      onIsExpandedChange={(open) => {
        state.setOpen(open);
        if (open) {
          void state.exclusions.load();
        }
      }}
    >
      <Button
        label="제외할 폴더 선택"
        modifiers={[unavailable(state.disabled)]}
        onPress={() => {
          if (!state.disabled) {
            void state.pickFolder();
          }
        }}
      />
      {state.unknown > 0 && (
        <SettingsNote>{`원래 폴더를 확인할 수 없는 파일이 ${state.unknown}개 있습니다. 해당 폴더를 다시 가져오면 폴더 정보를 연결할 수 있습니다.`}</SettingsNote>
      )}
      <SettingsFeedback
        loading={state.busy}
        error={state.message ?? state.exclusions.error ?? state.local.error}
        disabled={state.busy}
        onRetry={
          state.exclusions.error
            ? () => {
                void state.exclusions.load(true);
              }
            : undefined
        }
      />
      <SettingsField label="제외 폴더 검색" value={state.term} onChange={state.setTerm} />
      {state.rows.slice(0, 100).map((row) => (
        <Group key={row.path}>
          <SettingsToggle
            label={row.path}
            value={state.selected.has(row.path)}
            disabled={state.disabled}
            onChange={(value) => {
              void state.save(
                value
                  ? [...state.exclusions.folders, row.path]
                  : state.exclusions.folders.filter((folder) => folder !== row.path),
              );
            }}
          />
          {row.hasChildren && (
            <Button
              label={row.expanded ? `${row.path} 하위 폴더 접기` : `${row.path} 하위 폴더 보기`}
              modifiers={[unavailable(!!state.term.trim())]}
              onPress={() =>
                state.setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(row.path)) {
                    next.delete(row.path);
                  } else {
                    next.add(row.path);
                  }
                  return next;
                })
              }
            />
          )}
        </Group>
      ))}
      {!state.rows.length && (
        <SettingsNote>
          표시할 폴더가 없습니다. 폴더를 직접 선택하거나 기기 음악을 다시 가져오세요.
        </SettingsNote>
      )}
    </DisclosureGroup>
  );
}
