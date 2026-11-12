import { Platform } from 'react-native';

/** Only the settings group presents a sheet. Its child routes use a normal stack. */
export function settingsPresentationOptions() {
  if (Platform.OS !== 'ios') {
    return {};
  }
  return {
    presentation: 'formSheet' as const,
    animation: 'slide_from_bottom' as const,
    sheetAllowedDetents: [0.5, 1],
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: true,
    gestureEnabled: true,
    headerShown: false,
    contentStyle: { backgroundColor: 'transparent' },
  };
}
