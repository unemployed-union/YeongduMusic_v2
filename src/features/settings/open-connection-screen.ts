import { Platform } from 'react-native';
import { router, type NativeStackNavigationProp } from 'expo-router';

/** Clear native settings sheets before replacing the library with the connection screen. */
export function openConnectionScreen(
  rootNavigation: Pick<NativeStackNavigationProp<{ connect: undefined }>, 'getState' | 'dispatch'>,
) {
  if (Platform.OS === 'ios') {
    const state = rootNavigation.getState();
    // SDK 58 ignores partial resets. Keep the mounted stack's complete state and key sequence.
    rootNavigation.dispatch({
      type: 'RESET',
      target: state.key,
      payload: {
        ...state,
        index: 0,
        routes: [{ name: 'connect' }],
      },
    });
  } else {
    router.replace('/connect');
  }
}
