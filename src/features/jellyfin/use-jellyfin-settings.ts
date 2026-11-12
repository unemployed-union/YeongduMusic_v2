import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJellyfinStore } from '@/stores/jellyfin';
import { musicProvider } from '@/services/music-providers/registry';
import { jellyfinScope } from '@/services/jellyfin/api';

export function useJellyfinSettings() {
  const store = useJellyfinStore();
  const [address, setAddress] = useState(store.connection?.baseUrl ?? '');
  const [username, setUsername] = useState(store.connection?.username ?? '');
  const [password, setPassword] = useState('');
  const [allowHttp, setAllowHttp] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scope = store.connection ? jellyfinScope(store.connection) : '';
  const libraries = useQuery({
    queryKey: ['provider-libraries', 'jellyfin', scope, store.generation],
    enabled: !!store.connection && !store.busy,
    queryFn: ({ signal }) => musicProvider('jellyfin').libraries!.list(signal),
    retry: false,
  });
  async function connect() {
    setNotice(null);
    const secret = password;
    setPassword('');
    await store.connect(address, username, secret, allowHttp);
  }
  async function check() {
    const client = store.client();
    const generation = store.generation;
    setChecking(true);
    setNotice(null);
    try {
      await client.check();
      if (useJellyfinStore.getState().generation === generation) {
        setNotice('Jellyfin 연결과 로그인을 확인했습니다.');
      }
    } catch {
      if (useJellyfinStore.getState().generation === generation) {
        setNotice('연결을 확인하지 못했습니다. 서버와 로그인 상태를 확인해 주세요.');
      }
    } finally {
      setChecking(false);
    }
  }
  return {
    store,
    address,
    setAddress,
    username,
    setUsername,
    password,
    setPassword,
    allowHttp,
    setAllowHttp,
    checking,
    notice,
    libraries,
    connect,
    check,
  };
}
