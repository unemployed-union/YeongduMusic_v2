import { SettingsFeedback, SettingsNote } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { Button, DisclosureGroup, Group } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { addDriveDocuments } from './add-documents';

export function DriveDocumentSettings({ blocked }: { blocked: boolean }) {
  const documents = useDriveDocumentsStore();
  const [search, setSearch] = useState('');
  const busy = blocked || documents.busy;
  const matching = documents.documents.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <Group>
      <Button
        label="Google Drive 음원 선택"
        modifiers={[disabled(busy)]}
        onPress={() => {
          void addDriveDocuments(busy);
        }}
      />
      <SettingsFeedback loading={documents.busy} error={documents.error} />
      {documents.message && <SettingsNote>{documents.message}</SettingsNote>}
      <DisclosureGroup label={`선택한 음원 관리 · ${documents.documents.length}곡`}>
        <SettingsField label="선택한 음원 검색" value={search} onChange={setSearch} />
        {matching.slice(0, 100).map((item) => (
          <Button
            key={item.id}
            label={`${item.name} 선택 해제`}
            modifiers={[disabled(busy)]}
            onPress={() => {
              void documents.remove(item.id);
            }}
          />
        ))}
        {!matching.length && <SettingsNote>표시할 음원이 없습니다.</SettingsNote>}
      </DisclosureGroup>
    </Group>
  );
}
