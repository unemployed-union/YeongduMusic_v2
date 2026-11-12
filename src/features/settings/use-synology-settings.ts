import { useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { discover, normalizeAddress } from '@/services/synology/api';
import { clearLibraryCache } from '@/services/synology/cache';
import { stopNasPlayback } from '@/services/playback/controller';
import { useAuthStore } from '@/stores/auth';
import { openConnectionScreen } from './open-connection-screen';

export function useSynologySettings() {
  const rootNavigation = useNavigation<NativeStackNavigationProp<{ connect: undefined }>>('/');
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const disconnect = useAuthStore((state) => state.disconnect);
  const [address, setAddress] = useState(session?.baseUrl ?? '');
  const [allowHttp, setAllowHttp] = useState(session?.baseUrl.startsWith('http://') ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const isHttp = address.trim().toLowerCase().startsWith('http://');
  const validInput = !!address.trim() && (!isHttp || allowHttp);
  const openLogin = () => openConnectionScreen(rootNavigation);

  const testAddress = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const normalized = normalizeAddress(address, allowHttp);
      const apis = await discover(normalized);
      setTestResult(
        `연결 확인 완료 · Audio Station API ${Object.keys(apis).filter((name) => name.startsWith('SYNO.AudioStation.')).length}개 발견`,
      );
      return normalized;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'NAS 연결을 확인할 수 없습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const changeAddress = async () => {
    const normalized = await testAddress();
    if (!normalized) {
      return;
    }
    if (normalized === session?.baseUrl) {
      Keyboard.dismiss();
      return;
    }
    setBusy(true);
    try {
      stopNasPlayback();
      await disconnect(normalized);
      await clearLibraryCache();
      openConnectionScreen(rootNavigation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '접속 주소를 변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert(
      mode === 'mock' ? '데모 종료' : 'NAS 연결 해제',
      'NAS 재생과 연결을 종료하고 연결 화면으로 돌아갑니다. 이 기기·Google Drive 연결은 유지합니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                stopNasPlayback();
                await disconnect();
                await clearLibraryCache();
                openConnectionScreen(rootNavigation);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '연결을 해제하지 못했습니다.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );

  return {
    mode,
    session,
    address,
    setAddress,
    allowHttp,
    setAllowHttp,
    busy,
    error,
    testResult,
    setTestResult,
    isHttp,
    validInput,
    openLogin,
    testAddress,
    changeAddress,
    leave,
  };
}
