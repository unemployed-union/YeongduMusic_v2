import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateHiddenSettings(): Promise<void> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hardware || !enrolled) throw new Error('기기 설정에서 지문 또는 생체 인증을 등록해 주세요.');
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '숨김 음악 설정 잠금 해제',
    promptDescription: '프리셋을 확인하거나 변경하려면 인증해 주세요.',
    cancelLabel: '취소', disableDeviceFallback: true, fallbackLabel: '',
    biometricsSecurityLevel: 'strong',
  });
  if (!result.success) {
    if (result.error === 'lockout') throw new Error('생체 인증이 잠겼습니다. 기기의 잠금을 해제한 후 다시 시도해 주세요.');
    if (result.error === 'not_available' || result.error === 'not_enrolled') throw new Error('이 기기에서 사용할 수 있는 안전한 생체 인증을 확인해 주세요.');
    throw new Error('생체 인증을 완료하지 못했습니다. 다시 시도해 주세요.');
  }
}
