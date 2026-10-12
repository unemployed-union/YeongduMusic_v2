import { PresetManager } from '@/features/hidden-music/preset-manager';
import { HiddenSettingsGate } from '@/features/hidden-music/settings-gate';

export default function HiddenMusicScreen() {
  return <HiddenSettingsGate><PresetManager /></HiddenSettingsGate>;
}
