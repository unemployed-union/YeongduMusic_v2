import { Platform } from 'react-native';

/** Non-secret preferences only. Account credentials continue to use SecureStore. */
export async function readPreference(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }
  return (await import('expo-sqlite/kv-store')).default.getItem(key);
}

export async function writePreference(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await (await import('expo-sqlite/kv-store')).default.setItem(key, value);
}
