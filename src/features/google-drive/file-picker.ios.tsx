import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { useDriveFilePicker } from './use-drive-file-picker';

export function DriveFilePicker({ onClose }: { onClose: () => void }) {
  const state = useDriveFilePicker(onClose);
  const [search, setSearch] = useState('');
  const matching = state.files.filter((file) =>
    file.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <Group>
      <SettingsField
        label="음악 파일 검색"
        value={search}
        onChange={setSearch}
        disabled={state.saving}
      />
      {matching.slice(0, 100).map((file) => (
        <SettingsToggle
          key={file.id}
          label={file.name}
          value={state.ids.has(file.id)}
          disabled={state.saving}
          onChange={(value) => {
            state.setError(null);
            state.setIds((previous) => {
              const next = new Set(previous);
              if (value) {
                next.add(file.id);
              } else {
                next.delete(file.id);
              }
              return next;
            });
          }}
        />
      ))}
      <SettingsFeedback loading={state.saving} error={state.error} />
      <Button
        label="선택 목록 저장"
        modifiers={[disabled(!state.changed || state.saving)]}
        onPress={() => {
          void state.save();
        }}
      />
      <Button label="편집 취소" modifiers={[disabled(state.saving)]} onPress={state.close} />
    </Group>
  );
}
