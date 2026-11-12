import { Switch } from 'react-native';
import { playHaptic } from '@/services/haptics';
import { useColors } from '@/theme/tokens';
import type { AnimatedSwitchProps } from './animated-switch';

/** UIKit supplies the switch's geometry, animation, accessibility and system appearance. */
export function AnimatedSwitch({
  value = false,
  disabled = false,
  busy = false,
  haptics = true,
  onValueChange,
  ...props
}: AnimatedSwitchProps) {
  const colors = useColors();
  const blocked = disabled || busy;
  return (
    <Switch
      {...props}
      trackColor={{ ...props.trackColor, true: colors.tint }}
      value={value}
      disabled={blocked}
      accessibilityState={{ checked: value, disabled: blocked, busy }}
      onValueChange={(next) => {
        if (blocked || !onValueChange) {
          return;
        }
        if (haptics) {
          playHaptic('selection');
        }
        onValueChange(next);
      }}
      style={{ minHeight: 44 }}
    />
  );
}
