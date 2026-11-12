import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';

import { CREATOR_MESSAGE, CREATOR_URL } from './creator-info';
export { CREATOR_MESSAGE, CREATOR_URL } from './creator-info';

export function CreatorDialog({
  onClose,
  onPressName,
  nameDisabled = false,
  activationError,
}: {
  onClose: () => void;
  onPressName?: () => void;
  nameDisabled?: boolean;
  activationError?: string | null;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
            paddingLeft: insets.left + 20,
            paddingRight: insets.right + 20,
          },
        ]}
      >
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
              제작자
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="제작자 메시지 닫기"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Image
              source={require('../../../assets/images/creator-profile.png')}
              accessibilityLabel="무직노조의 GitHub 프로필 사진"
              resizeMode="contain"
              style={styles.photo}
            />
            {onPressName ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="무직노조"
                accessibilityState={{ disabled: nameDisabled }}
                disabled={nameDisabled}
                onPress={onPressName}
                style={styles.nickname}
              >
                <Text style={[styles.name, { color: colors.text }]}>
                  무직노조(unemployed-union)
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.name, { color: colors.text }]}>무직노조(unemployed-union)</Text>
            )}
            {activationError && (
              <Text accessibilityRole="alert" style={{ color: colors.tint }}>
                {activationError}
              </Text>
            )}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="무직노조 GitHub 프로필 열기"
              onPress={() => {
                setError(null);
                void Linking.openURL(CREATOR_URL).catch(() =>
                  setError('GitHub 프로필을 열지 못했습니다. 다시 눌러 주세요.'),
                );
              }}
              style={styles.link}
            >
              <Text selectable style={[styles.url, { color: colors.tint }]}>
                {CREATOR_URL}
              </Text>
            </Pressable>
            {error && (
              <Text accessibilityRole="alert" style={{ color: colors.tint }}>
                {error}
              </Text>
            )}
            <Text selectable style={[styles.message, { color: colors.text }]}>
              {CREATOR_MESSAGE}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000088',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 20, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 22, gap: 14 },
  photo: { width: 160, height: 160, borderRadius: 18, alignSelf: 'center' },
  name: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  nickname: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  url: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 25 },
});

export type CreatorDialogProps = Parameters<typeof CreatorDialog>[0];
