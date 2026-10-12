import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { getPlaybackAudioSessionId } from './controller';

let opening = false;
/** Open the manufacturer's audio effects UI; never create a second player. */
export async function openSystemEqualizer(): Promise<void> {
  if (Platform.OS !== 'android') {
    Alert.alert('시스템 이퀄라이저', 'iOS와 웹에서는 이 앱에서 시스템 이퀄라이저를 여는 공식 기능을 지원하지 않습니다.');
    return;
  }
  if (opening) return;
  opening = true;
  try {
    const sessionId = getPlaybackAudioSessionId();
    const extra: Record<string, string | number> = { 'android.media.extra.CONTENT_TYPE': 0 };
    const packageName = Constants.expoConfig?.android?.package;
    if (packageName) extra['android.media.extra.PACKAGE_NAME'] = packageName;
    if (sessionId !== null) extra['android.media.extra.AUDIO_SESSION'] = sessionId;
    await startActivityAsync('android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL', { extra });
  } catch {
    Alert.alert('이퀄라이저 바로 열기 미지원', '이 기기의 시스템 이퀄라이저를 직접 열 수 없습니다. 소리 설정에서 음질 및 음향 효과를 확인해 주세요.', [
      { text: '취소', style: 'cancel' },
      { text: '소리 설정 열기', onPress: () => { void startActivityAsync(ActivityAction.SOUND_SETTINGS).catch(() => Alert.alert('소리 설정', '시스템 설정 앱에서 소리 설정을 직접 열어 주세요.')); } },
    ]);
  } finally { opening = false; }
}
