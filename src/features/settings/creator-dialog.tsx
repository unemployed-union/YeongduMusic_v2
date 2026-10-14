import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';

export const CREATOR_URL = 'https://github.com/unemployed-union';
export const CREATOR_MESSAGE = `백수라 짧은 기간 내에 인적성이랑 코테같은 회사 관련 시험들을 3개를 본 후 아무것도 하기 싫은 찰나 뭐라도 해야지 하면서 만든 프로젝트입니다. 처음에는 단순히 DS Music 대체 앱을 만들어 보고 싶어서 시작한 프로젝트인데 이것저것 기능을 추가하다 보니 프로젝트가 점점 커지네요. 지금도 생각나는 기능을 막 집어넣고 있지만 점점 복잡해져서  이 프로젝트를 어떻게 관리해야 할 지 모르겠습니다 ㅋㅋ
제가 모자란건가 아님 다들 그런건가 잘 모르겠지만 취직하기 참 힘드네요. 또 계속 떨어지니까 원서 쓰고 코테 보고 하는 일들이 그냥 무의미한 일처럼 느껴지기도 하구요. 이래저래 심란하고 힘듭니다. 고통스러운 하루하루지만 그래도 잘 버텨 봅시다.

2026년 10월 14일 수요일
오후 4시 50분
원서 3개 접수한 뒤 기능을 추가하며

`;

export function CreatorDialog({ onClose }: { onClose: () => void }) {
  const colors = useColors(), insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>제작자</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="제작자 메시지 닫기" onPress={onClose} style={styles.close}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Image source={require('../../../assets/images/creator-profile.png')} accessibilityLabel="무직노조의 GitHub 프로필 사진" resizeMode="contain" style={styles.photo} />
          <Text style={[styles.name, { color: colors.text }]}>무직노조(unemployed-union)</Text>
          <Pressable accessibilityRole="link" accessibilityLabel="무직노조 GitHub 프로필 열기" onPress={() => {
            setError(null);
            void Linking.openURL(CREATOR_URL).catch(() => setError('GitHub 프로필을 열지 못했습니다. 다시 눌러 주세요.'));
          }} style={styles.link}><Text selectable style={[styles.url, { color: colors.tint }]}>{CREATOR_URL}</Text></Pressable>
          {error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
          <Text selectable style={[styles.message, { color: colors.text }]}>{CREATOR_MESSAGE}</Text>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000088' },
  card: { width: '100%', maxWidth: 520, maxHeight: '100%', flexShrink: 1, borderRadius: 22, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 20, fontWeight: '700' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 22, gap: 14 }, photo: { width: 160, height: 160, borderRadius: 18, alignSelf: 'center' },
  name: { fontSize: 18, fontWeight: '700', textAlign: 'center' }, link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  url: { fontSize: 13, lineHeight: 20, textAlign: 'center' }, message: { fontSize: 15, lineHeight: 25 },
});
