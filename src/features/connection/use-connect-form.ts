import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { discover, normalizeAddress, SynologyError } from '@/services/synology/api';

/** Shared login state/actions; each platform owns only its presentation. */
export function useConnectForm() {
  const pending = useRef(false);
  const connect = useAuthStore((state) => state.connect);
  const startDemo = useAuthStore((state) => state.useMock);
  const notice = useAuthStore((state) => state.notice);
  const preferredAddress = useAuthStore((state) => state.preferredAddress);
  const [address, setAddress] = useState(preferredAddress ?? '');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [allowHttp, setAllowHttp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const isHttp = address.trim().toLowerCase().startsWith('http://');
  const disabled =
    loading || !address || !account || !password || (needsOtp && !otp) || (isHttp && !allowHttp);
  const submit = async () => {
    if (disabled || pending.current) {
      return;
    }
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      await connect(address, account, password, otp, allowHttp);
      setPassword('');
      setOtp('');
      router.replace('/(tabs)/(library)');
    } catch (cause) {
      if (cause instanceof SynologyError && (cause.code === 403 || cause.code === 406)) {
        setNeedsOtp(true);
      }
      setError(cause instanceof Error ? cause.message : 'NAS 연결에 실패했습니다.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };
  const testAddress = async () => {
    if (loading || pending.current || !address || (isHttp && !allowHttp)) {
      return;
    }
    pending.current = true;
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const apis = await discover(normalizeAddress(address, allowHttp));
      setTestResult(
        `NAS 연결 확인 완료 · Audio Station API ${Object.keys(apis).filter((name) => name.startsWith('SYNO.AudioStation.')).length}개 발견`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'NAS 연결을 확인할 수 없습니다.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const cancel = () => {
    if (!pending.current) {
      router.replace('/(tabs)/(library)');
    }
  };
  const enterDemo = () => {
    if (!pending.current) {
      startDemo();
      router.replace('/(tabs)/(library)');
    }
  };
  return {
    address,
    setAddress,
    account,
    setAccount,
    password,
    setPassword,
    otp,
    setOtp,
    needsOtp,
    allowHttp,
    setAllowHttp,
    loading,
    error,
    notice,
    testResult,
    setTestResult,
    isHttp,
    disabled,
    submit,
    testAddress,
    cancel,
    enterDemo,
  };
}
