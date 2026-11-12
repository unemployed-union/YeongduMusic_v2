import { useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useMyboxStore } from '@/stores/mybox';

export function useMyboxSettings() {
  const store = useMyboxStore();
  const [token, setToken] = useState('');
  const [folder, setFolder] = useState(store.connection?.folder ?? '/');
  const disabled = !store.ready || store.busy || store.loading || Platform.OS === 'web';
  async function connect() {
    if (disabled || !token.trim()) {
      return;
    }
    Keyboard.dismiss();
    const input = { token, folder };
    setToken('');
    await store.connect(input);
  }
  return { store, token, setToken, folder, setFolder, disabled, connect };
}
