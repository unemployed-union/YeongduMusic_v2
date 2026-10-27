/** Android, web and legacy binaries keep their existing in-app settings. */
export const isIosSystemSettingsAvailable = false;
export function useIosSystemSettingsReady() { return true; }
export function useIosSystemSettingsStatus(): { ready: boolean; error: string | null } { return { ready: true, error: null }; }
export async function refreshIosSystemSettings(): Promise<void> {}
