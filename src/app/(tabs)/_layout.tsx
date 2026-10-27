import { PlatformTabs } from '@/components/platform-tabs';
import LegacyTabs from '@/components/legacy-tabs';

export default function TabsLayout() {
  return <PlatformTabs fallback={LegacyTabs} />;
}
