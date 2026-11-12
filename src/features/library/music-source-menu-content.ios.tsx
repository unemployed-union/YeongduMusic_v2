import { musicSourceLabels } from '@/services/music-source';
import { Button, List, Picker, Section, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  disabled,
  foregroundStyle,
  labelsHidden,
  listStyle,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { SOURCE_CONNECTIONS, type MusicSourceMenuProps } from './music-source-menu-model';

/** The native List owns row spacing, separators, selection marks and Dynamic Type. */
export function MusicSourceMenuContent({
  sources,
  selected,
  busy,
  error,
  setup,
  onSelect,
  onOpenConnection,
  onImport,
  onReload,
}: MusicSourceMenuProps) {
  // A connection can disappear while this sheet is open. Keep a valid Picker tag
  // without silently changing the library's selected source.
  const selection = sources.includes(selected) ? selected : 'unavailable';
  return (
    <List
      modifiers={[
        listStyle('insetGrouped'),
        foregroundStyle({ type: 'hierarchical', style: 'primary' }),
      ]}
    >
      <Section title="음악 보관함">
        <Picker
          label=""
          selection={selection}
          modifiers={[
            pickerStyle('inline'),
            labelsHidden(),
            accessibilityLabel('음악 보관함 선택'),
          ]}
          onSelectionChange={(source) => {
            if (source !== 'unavailable' && source !== selected && sources.includes(source)) {
              onSelect(source);
            }
          }}
        >
          {selection === 'unavailable' && (
            <Text modifiers={[tag('unavailable'), disabled(true)]}>음악 소스를 선택하세요</Text>
          )}
          {sources.map((source) => (
            <Text key={source} modifiers={[tag(source)]}>
              {musicSourceLabels[source]}
            </Text>
          ))}
        </Picker>
      </Section>
      <Section title="연결 관리">
        {SOURCE_CONNECTIONS.map((connection) => (
          <Button
            key={connection.href}
            label={connection.title}
            onPress={() => onOpenConnection(connection.href)}
          />
        ))}
      </Section>
      <Section
        title="기기 음악 가져오기"
        footer={
          <Text>
            파일 앱에서 폴더 또는 음악 파일을 선택하세요. 원본은 유지하며 앱 저장 공간에 복사합니다.
          </Text>
        }
      >
        <Button
          label="폴더 선택 · 하위 폴더 포함"
          modifiers={[disabled(busy)]}
          onPress={() => onImport('folder')}
        />
        <Button label="파일 선택" modifiers={[disabled(busy)]} onPress={() => onImport('files')} />
      </Section>
      <Section title="보관함 관리">
        <Button
          label="저장된 음악 목록 다시 불러오기"
          modifiers={[disabled(busy)]}
          onPress={onReload}
        />
        {setup && <Button label="NAS 연결" onPress={() => onOpenConnection('/connect')} />}
      </Section>
      {error && (
        <Section title="가져오기 오류">
          <Text modifiers={[foregroundStyle('red')]}>{error}</Text>
        </Section>
      )}
    </List>
  );
}
