import { DRIVE_SCOPE } from '@/services/google-drive/config';

export function hasDriveFileGrant(scopes: readonly string[]): boolean {
  return (
    scopes.includes(DRIVE_SCOPE) &&
    !scopes.some(
      (scope) => scope.startsWith('https://www.googleapis.com/auth/drive') && scope !== DRIVE_SCOPE,
    )
  );
}
