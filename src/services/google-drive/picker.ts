import { hasDriveFileGrant } from './scopes';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { GOOGLE_IOS_CLIENT_ID } from './config';
import { driveJson } from './api';

type Result = { accessToken: string; fileIds: string[]; scopes: string[] };
type Picker = {
  pick: (email: string, iosClientId: string) => Promise<Result | null>;
  token: (email: string) => Promise<Result | null>;
};
function native(): Picker {
  if (Platform.OS === 'web') {
    throw new Error('Google 파일 선택은 Android·iOS 앱에서 사용할 수 있습니다.');
  }
  const module = requireOptionalNativeModule<Picker>('YeongduDrivePicker');
  if (!module) {
    throw new Error('Google 파일 선택을 지원하는 새 네이티브 빌드를 설치해 주세요.');
  }
  return module;
}
function token(result: Result | null): string {
  if (!result || typeof result.accessToken !== 'string' || !result.accessToken.trim()) {
    throw new Error('Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.');
  }
  // Sign-in can also return identity scopes. Only Drive scopes must be file-only.
  const scopes = result.scopes;
  if (
    !Array.isArray(scopes) ||
    scopes.some((scope) => typeof scope !== 'string') ||
    !hasDriveFileGrant(scopes)
  ) {
    throw new Error('Google 선택 파일 접근 권한을 확인할 수 없습니다. 다시 연결해 주세요.');
  }
  return result.accessToken;
}
export async function driveFileAccessToken(email: string): Promise<string> {
  return token(await native().token(email));
}
export async function pickDriveFileIds(email: string): Promise<string[] | null> {
  const result = await native().pick(email, GOOGLE_IOS_CLIENT_ID ?? '');
  if (result === null) {
    return null;
  }
  const accessToken = token(result);
  if (
    !Array.isArray(result.fileIds) ||
    result.fileIds.length > 10000 ||
    result.fileIds.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(id))
  ) {
    throw new Error('Google 파일 선택 결과를 확인할 수 없습니다.');
  }
  // A browser can have a different active Google account from the native SDK.
  const identity = await driveJson(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    async () => accessToken,
  );
  if (
    !identity ||
    typeof identity !== 'object' ||
    !('user' in identity) ||
    !identity.user ||
    typeof identity.user !== 'object' ||
    !('emailAddress' in identity.user) ||
    typeof identity.user.emailAddress !== 'string' ||
    identity.user.emailAddress.toLowerCase() !== email.toLowerCase()
  ) {
    throw new Error(
      'Google 파일 선택 계정이 연결된 계정과 다릅니다. 같은 Google 계정으로 선택해 주세요.',
    );
  }
  return [...new Set(result.fileIds)];
}
