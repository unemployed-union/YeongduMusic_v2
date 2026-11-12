import { Platform, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { playerScreenStyles as styles } from './player-screen-styles';

type Props = {
  width: number;
  split: boolean;
  showQueue: boolean;
  onClose(): void;
  onShowLyrics(): void;
  onToggleQueue(): void;
};
export function PlayerHeader({
  width,
  split,
  showQueue,
  onClose,
  onShowLyrics,
  onToggleQueue,
}: Props) {
  const ios = Platform.OS === 'ios';
  return (
    <View style={[styles.top, { width: width, alignSelf: 'center' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="플레이어 닫기"
        hitSlop={ios ? undefined : 4}
        onPress={onClose}
        style={[styles.topButton, ios && styles.iosTopButton]}
      >
        <Ionicons name="chevron-down" size={26} color="white" />
      </Pressable>
      {split && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="가사 보기"
          hitSlop={ios ? undefined : 4}
          accessibilityState={{ selected: !showQueue }}
          onPress={onShowLyrics}
          style={[
            styles.topButton,
            ios && styles.iosTopButton,
            { marginLeft: 'auto', marginRight: 12 },
          ]}
        >
          <Ionicons
            name="chatbox-ellipses-outline"
            size={24}
            color={showQueue ? '#FFFFFF88' : 'white'}
          />
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="대기열"
        hitSlop={ios ? undefined : 4}
        accessibilityState={{ selected: showQueue }}
        onPress={onToggleQueue}
        style={[styles.topButton, ios && styles.iosTopButton]}
      >
        <Ionicons name={showQueue ? 'albums' : 'list'} size={26} color="white" />
      </Pressable>
    </View>
  );
}
