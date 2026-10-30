import { StyleSheet, View } from 'react-native';
import { Text } from './text';

/** Render inside a sheet so the toast also stays visible above native modals. */
export function ToastNotice({ message }: { message: string }) {
  return (
    <View pointerEvents="none" style={styles.toast}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 72,
    zIndex: 10,
    elevation: 8,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: '#292929F2',
  },
  text: { color: '#FFFFFF', fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
