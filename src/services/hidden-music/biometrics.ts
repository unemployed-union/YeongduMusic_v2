import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export async function authenticateHiddenSettings(): Promise<void> {
  // SECRET includes a device PIN/password even when no biometrics are enrolled.
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) throw new Error('기기 설정에서 화면 잠금 PIN·암호·패턴 또는 생체 인증을 등록해 주세요.');
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '숨김 음악 설정 잠금 해제',
    promptDescription: '지문 또는 기기 PIN·암호·패턴으로 인증해 주세요.',
    cancelLabel: '취소', disableDeviceFallback: false, fallbackLabel: '기기 암호 사용',
    // Android 10 and older cannot combine STRONG with DEVICE_CREDENTIAL.
    biometricsSecurityLevel: Platform.OS === 'android' && Number(Platform.Version) < 30 ? 'weak' : 'strong',
  });
  if (!result.success) {
    if (result.error === 'lockout') throw new Error('생체 인증이 잠겼습니다. 다시 열어 기기 암호를 사용해 주세요.');
    if (result.error === 'not_available' || result.error === 'not_enrolled' || result.error === 'passcode_not_set') throw new Error('기기 설정에서 화면 잠금 PIN·암호·패턴을 확인해 주세요.');
    throw new Error('인증을 완료하지 못했습니다. 지문 또는 기기 암호로 다시 시도해 주세요.');
  }
}
