import { playHaptic } from '@/services/haptics';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import {
  Button,
  Group,
  Host,
  HStack,
  Image,
  List,
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Text,
} from '@expo/ui/swift-ui';
import {
  disabled,
  environment,
  font,
  foregroundStyle,
  listRowInsets,
  listStyle,
} from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import type { SettingsLinkProps, SettingsPageProps, SettingsSectionProps } from './settings-ui';

const NativeSettingsContext = createContext(false);

export function SettingsNativeContent({ children }: { children: ReactNode }) {
  const inNativeForm = useContext(NativeSettingsContext);
  const scheme = useAppColorScheme();
  const colors = useColors();
  if (inNativeForm) {
    return <>{children}</>;
  }
  return (
    <Host matchContents={{ vertical: true }} colorScheme={scheme} seedColor={colors.tint}>
      {children}
    </Host>
  );
}

export function SettingsPage({
  children,
  overlay,
  reordering = false,
  systemAppearance = true,
}: SettingsPageProps) {
  const scheme = useAppColorScheme();
  const colors = useColors();
  return (
    <View style={{ flex: 1 }}>
      <NativeSettingsContext.Provider value>
        <Host
          style={{ flex: 1 }}
          colorScheme={systemAppearance ? scheme : 'dark'}
          seedColor={systemAppearance ? colors.tint : '#FFFFFF'}
        >
          <List
            modifiers={[
              ...(!systemAppearance ? [foregroundStyle('white')] : []),
              listStyle('insetGrouped'),
              ...(reordering ? [environment('editMode', 'active')] : []),
            ]}
          >
            {Children.toArray(children).map((child, index) => {
              if (
                isValidElement(child) &&
                (child.type === SettingsSection || child.type === SettingsNativeContent)
              ) {
                return child;
              }
              return <SettingsRowContent key={index}>{child}</SettingsRowContent>;
            })}
          </List>
        </Host>
      </NativeSettingsContext.Provider>
      {overlay}
    </View>
  );
}

export function SettingsSection({
  title,
  children,
  description,
  nativeContent = false,
}: SettingsSectionProps) {
  const rows = Children.toArray(children);
  return (
    <Section
      title={title}
      footer={
        description ? (
          <Text
            modifiers={[
              font({ textStyle: 'footnote' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          >
            {description}
          </Text>
        ) : undefined
      }
    >
      {rows.map((child, index) => {
        const nativeRow =
          nativeContent ||
          (isValidElement(child) &&
            (child.type === SettingsLink || child.type === SettingsNativeContent));
        return nativeRow ? child : <SettingsRowContent key={index}>{child}</SettingsRowContent>;
      })}
    </Section>
  );
}

/** Native forms can host existing multi-step editors without duplicating their state or actions. */
export function SettingsRowContent({ children }: { children: ReactNode }) {
  return (
    <Group modifiers={[listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 })]}>
      <RNHostView matchContents={{ vertical: true }}>
        <NativeSettingsContext.Provider value={false}>
          <View style={{ backgroundColor: 'transparent' }}>{children}</View>
        </NativeSettingsContext.Provider>
      </RNHostView>
    </Group>
  );
}

export function SettingsLink({
  title,
  href,
  badge,
  disabled: unavailable = false,
  busy = false,
}: SettingsLinkProps) {
  const inNativeForm = useContext(NativeSettingsContext);
  const scheme = useAppColorScheme();
  const colors = useColors();
  const blocked = unavailable || busy;
  const row = (
    <Button
      modifiers={[disabled(blocked)]}
      onPress={() => {
        if (!blocked) {
          playHaptic('menu');
          router.push(href);
        }
      }}
    >
      <HStack spacing={12}>
        <Text modifiers={[foregroundStyle(colors.text)]}>{title}</Text>
        <Spacer />
        {badge && (
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(colors.muted)]}>
            {badge}
          </Text>
        )}
        {busy ? (
          <ProgressView />
        ) : (
          <Image
            systemName="chevron.forward"
            modifiers={[
              font({ textStyle: 'footnote', weight: 'semibold' }),
              foregroundStyle(colors.muted),
            ]}
          />
        )}
      </HStack>
    </Button>
  );
  if (inNativeForm) {
    return row;
  }
  return (
    <Host matchContents={{ vertical: true }} colorScheme={scheme} seedColor={colors.tint}>
      {row}
    </Host>
  );
}
