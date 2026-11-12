import notices from '@/assets/legal/notices.json';
import { DisclosureGroup, Text } from '@expo/ui/swift-ui';
import { textSelection } from '@expo/ui/swift-ui/modifiers';
import { useMemo, useState } from 'react';
import { SettingsNote } from './ios/controls';
import { SettingsField } from './ios/field';
import { SettingsPage, SettingsSection } from './settings-ui';

export function LicensesSettings() {
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = useMemo(
    () =>
      notices.entries.filter(
        (entry) =>
          (entry.platform === 'all' || entry.platform === 'ios') &&
          `${entry.name} ${entry.license}`
            .toLocaleLowerCase()
            .includes(term.trim().toLocaleLowerCase()),
      ),
    [term],
  );
  return (
    <SettingsPage>
      <SettingsSection
        title="오픈소스 라이선스"
        nativeContent
        description="이 앱에 포함된 오픈소스의 저작권 고지와 라이선스를 확인할 수 있습니다."
      >
        <SettingsField label="이름 또는 라이선스 검색" value={term} onChange={setTerm} />
        {entries.map((entry) => (
          <DisclosureGroup
            key={entry.id}
            label={`${entry.name} · ${entry.license}`}
            isExpanded={expanded === entry.id}
            onIsExpandedChange={(open) => setExpanded(open ? entry.id : null)}
          >
            {expanded === entry.id && (
              <Text modifiers={[textSelection(true)]}>
                {[entry.version, entry.url, ...entry.texts].filter(Boolean).join('\n\n')}
              </Text>
            )}
          </DisclosureGroup>
        ))}
        {!entries.length && <SettingsNote>일치하는 항목이 없습니다.</SettingsNote>}
      </SettingsSection>
    </SettingsPage>
  );
}
