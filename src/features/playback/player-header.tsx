import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassBackdrop } from '@/components/glass-backdrop';
import { playerScreenStyles as styles, glassTopButton } from './player-screen-styles';

type Props = {
  width: number;
  split: boolean;
  showQueue: boolean;
  glassSupported: boolean;
  glassEnabled: boolean;
  onClose(): void;
  onShowLyrics(): void;
  onToggleQueue(): void;
};
export function PlayerHeader({
  width,
  split,
  showQueue,
  glassSupported,
  glassEnabled,
  onClose,
  onShowLyrics,
  onToggleQueue,
}: Props) {
  const ios = Platform.OS === 'ios';
  return (
    <View style={[styles.top, { width: width, alignSelf: 'center' }]}>
      <Pressable
        accessibilityLabel="플레이어 닫기"
        onPress={onClose}
        style={[
          styles.topButton,
          glassSupported && glassTopButton,
          ios && { backgroundColor: 'transparent' },
        ]}
      >
        {!ios && glassEnabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}
        <Ionicons name="chevron-down" size={26} color="white" />
      </Pressable>
      {split && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="가사 보기"
          accessibilityState={{ selected: !showQueue }}
          onPress={onShowLyrics}
          style={[
            styles.topButton,
            glassSupported && glassTopButton,
            { marginLeft: 'auto', marginRight: 12 },
          ]}
        >
          {glassEnabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}
          <Ionicons
            name="chatbox-ellipses-outline"
            size={24}
            color={showQueue ? '#FFFFFF88' : 'white'}
          />
        </Pressable>
      )}
      <Pressable
        accessibilityLabel="대기열"
        onPress={onToggleQueue}
        style={[
          styles.topButton,
          glassSupported && glassTopButton,
          ios && { backgroundColor: 'transparent' },
        ]}
      >
        {!ios && glassEnabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}
        <Ionicons name={showQueue ? 'albums' : 'list'} size={26} color="white" />
      </Pressable>
    </View>
  );
}
