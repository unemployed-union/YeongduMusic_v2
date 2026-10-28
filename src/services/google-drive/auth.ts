import { Platform } from 'react-native';
import {
  DRIVE_SCOPE,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@/services/google-drive/config';

let configured = false;
export async function googleSignIn() {
  if (Platform.OS === 'web')
    throw new Error('Google Drive 연결은 Android/iOS 앱에서 사용할 수 있습니다.');
  if (Platform.OS === 'ios' && (!GOOGLE_WEB_CLIENT_ID || !GOOGLE_IOS_CLIENT_ID))
    throw new Error(
      'Google OAuth 클라이언트 ID 설정이 필요합니다. README의 Google Drive 설정을 확인해 주세요.',
    );
  let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin;
  try {
    ({ GoogleSignin } = await import('@react-native-google-signin/google-signin'));
  } catch {
    throw new Error(
      'Google 로그인 모듈이 없습니다. Expo Go 대신 새 네이티브 빌드를 설치해 주세요.',
    );
  }
  if (!configured) {
    // Android Drive calls use accessToken only. webClientId would also request an
    // unused backend ID token and require a separate server-client configuration.
    GoogleSignin.configure({
      ...(Platform.OS === 'ios'
        ? { webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID }
        : {}),
      scopes: [DRIVE_SCOPE],
      offlineAccess: false,
    });
    configured = true;
  }
  return GoogleSignin;
}
export function googleConnectionError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && String(error.code) === '10')
    return 'Google OAuth 설정 오류(코드 10) · 실제 설치된 APK의 패키지명·서명 SHA-1에 해당하는 Android OAuth 클라이언트를 확인해 주세요. Drive API와 동의 화면도 같은 Google Cloud 프로젝트에 설정해야 합니다.';
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ASYNC_OP_IN_PROGRESS'
  )
    return 'Google 인증 요청이 아직 진행 중입니다. Google 인증 창을 닫은 뒤 다시 시도해 주세요. 계속되면 앱을 완전히 종료하고 다시 열어 주세요.';
  return error instanceof Error &&
    (error.message.startsWith('Google') || error.message.startsWith('예상하지'))
    ? error.message
    : 'Google 연결을 확인할 수 없습니다. 로그인 설정과 네트워크를 확인한 뒤 다시 시도해 주세요.';
}
