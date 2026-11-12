import { useMenuPreferences } from '@/stores/menu-preferences';
import { Group, HStack, List, Spacer, Text } from '@expo/ui/swift-ui';
import { Animation, animation, moveDisabled } from '@expo/ui/swift-ui/modifiers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { SettingsFeedback, SettingsToggle } from './ios/controls';
import {
  MENU_GROUP_IDS,
  MENU_GROUP_LABELS,
  MENU_LABELS,
  type MenuGroup,
  type MenuId,
} from './menu-layout';
import { SETTINGS_DESCRIPTIONS } from './settings-descriptions';
import { SettingsSection } from './settings-ui';
import { useMenuReordering } from './use-menu-reordering';

export function MenuLayoutSettings({ group }: { group: MenuGroup }) {
  const load = useMenuPreferences((state) => state.load);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Group>
      <MenuVisibilitySection group={group} />
      <MenuOrderSection group={group} />
    </Group>
  );
}

function MenuVisibilitySection({ group }: { group: MenuGroup }) {
  const { ready, loading, error, load, setVisible } = useMenuPreferences(
    useShallow((state) => ({
      ready: state.ready,
      loading: state.loading,
      error: state.error,
      load: state.load,
      setVisible: state.setVisible,
    })),
  );
  // Visibility controls stay in catalog order while the separate reorder list moves.
  const values = useMenuPreferences(
    useShallow((state) =>
      MENU_GROUP_IDS[group].map(
        (id) => state.layout[group].find((item) => item.id === id)?.visible,
      ),
    ),
  );
  const [saving, setSaving] = useState(false);
  const changing = useRef(false);
  const disabled = !ready || loading || saving;
  const visibleCount = values.filter(Boolean).length;

  function changeVisibility(id: MenuId, visible: boolean) {
    if (disabled || changing.current) {
      return;
    }
    changing.current = true;
    setSaving(true);
    void setVisible(group, id, visible)
      .catch(() => {})
      .finally(() => {
        changing.current = false;
        setSaving(false);
      });
  }

  return (
    <SettingsSection
      title={`${MENU_GROUP_LABELS[group]} 표시`}
      description={SETTINGS_DESCRIPTIONS.menuVisibility}
      nativeContent
    >
      {MENU_GROUP_IDS[group].map((id, index) => {
        const visible = values[index];
        if (visible === undefined) {
          return null;
        }
        return (
          <SettingsToggle
            key={id}
            label={MENU_LABELS[id]}
            value={visible}
            disabled={disabled || (visible && visibleCount === 1)}
            onChange={(value) => changeVisibility(id, value)}
          />
        );
      })}
      <SettingsFeedback
        loading={loading}
        error={error}
        disabled={disabled}
        onRetry={() => void load(true)}
      />
    </SettingsSection>
  );
}

const menuKey = (id: MenuId) => id;

function MenuOrderSection({ group }: { group: MenuGroup }) {
  const { ids, disabled, reorder, revision } = useMenuReordering(group);
  const reduceMotion = useReducedMotion();
  const renderRow = useCallback(
    ({ item }: { item: MenuId }) => (
      // Let List lift the entire row, including its native insets and reorder handle.
      // A dragPreview shape here clips the preview to the smaller content bounds.
      <HStack modifiers={[moveDisabled(disabled)]}>
        <Text>{MENU_LABELS[item]}</Text>
        <Spacer />
      </HStack>
    ),
    [disabled],
  );
  return (
    <SettingsSection
      title={`${MENU_GROUP_LABELS[group]} 순서`}
      description={SETTINGS_DESCRIPTIONS.menuLayout}
      nativeContent
    >
      <List.ForEach
        data={ids}
        keyExtractor={menuKey}
        recycling={false}
        onMove={reorder}
        modifiers={
          reduceMotion
            ? []
            : [animation(Animation.smooth({ duration: 0.22, extraBounce: 0 }), revision)]
        }
      >
        {renderRow}
      </List.ForEach>
    </SettingsSection>
  );
}
