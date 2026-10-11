import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

export default function Index() {
  const mode = useAuthStore((state) => state.mode);
  return <Redirect href={mode === 'setup' ? '/connect' : '/(tabs)/(library)'} />;
}
