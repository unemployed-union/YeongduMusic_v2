import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import MaskedView from '@react-native-masked-view/masked-view';
import { Text } from '@/components/text';
import { usePlaybackStore } from '@/stores/playback';
import { usePlaybackPreferences } from '@/stores/playback-preferences';
import { seek } from '@/services/playback/controller';
import { playHaptic } from '@/services/haptics';
const SLIDER_INSET = 14;
function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function PlayerProgress({
  active,
  width,
  fallbackDuration,
  accent,
}: {
  active: boolean;
  width: number;
  fallbackDuration: number;
  accent: string;
}) {
  const position = usePlaybackStore((state) => (active ? state.position : 0));
  const duration = usePlaybackStore((state) => state.duration) || fallbackDuration;
  const ios = Platform.OS === 'ios';
  const [draft, setDraft] = useState<number | null>(null);
  const [previousActive, setPreviousActive] = useState(active);
  const seekRequest = useRef(0);
  if (previousActive !== active) {
    setPreviousActive(active);
    setDraft(null);
  }
  const displayedPosition = ios && draft !== null ? draft : position;
  const slider = (
    <Slider
      accessibilityLabel="재생 위치"
      style={[
        styles.slider,
        { width: ios ? width : width + SLIDER_INSET * 2 },
        ios && styles.iosSlider,
      ]}
      minimumValue={0}
      maximumValue={Math.max(duration, 1)}
      value={Math.min(displayedPosition, duration || 1)}
      minimumTrackTintColor={accent}
      maximumTrackTintColor="#FFFFFF55"
      thumbTintColor={ios ? 'transparent' : accent}
      tapToSeek={ios}
      onTouchCancel={ios ? () => setDraft(null) : undefined}
      onSlidingStart={
        ios
          ? (value) => {
              seekRequest.current++;
              setDraft(value);
            }
          : undefined
      }
      onValueChange={ios ? (value) => setDraft(value) : undefined}
      onSlidingComplete={(value) => {
        playHaptic('seek');
        const playOnSeek = usePlaybackPreferences.getState().playOnSeek;
        if (!ios) {
          void seek(value, playOnSeek);
          return;
        }
        setDraft(value);
        const request = ++seekRequest.current;
        const finish = () => {
          if (request === seekRequest.current) {
            setDraft(null);
          }
        };
        void seek(value, playOnSeek).then(finish, finish);
      }}
    />
  );
  return (
    <>
      {ios ? (
        <View style={{ width, height: 44 }}>
          {/* Keep UIKit's thumb, shadow and lens masked even while scrubbing.
          The native slider still handles touches and accessibility. */}
          <View
            pointerEvents="none"
            accessible={false}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 19,
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: '#FFFFFF55',
            }}
          >
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: accent,
                width: `${duration > 0 ? Math.max(0, Math.min(1, displayedPosition / duration)) * 100 : 0}%`,
              }}
            />
          </View>
          <MaskedView
            style={{ width, height: 44 }}
            maskElement={<View style={{ flex: 1, backgroundColor: 'transparent' }} />}
          >
            {slider}
          </MaskedView>
        </View>
      ) : (
        slider
      )}
      <View style={styles.times}>
        <Text style={styles.time}>{clock(displayedPosition)}</Text>
        <Text style={styles.time}>-{clock(Math.max(0, duration - displayedPosition))}</Text>
      </View>
    </>
  );
}
export const styles = StyleSheet.create({
  slider: { height: 27, marginLeft: -SLIDER_INSET },
  iosSlider: { height: 44, marginLeft: 0 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  time: { color: '#FFFFFFA6', fontSize: 12, fontVariant: ['tabular-nums'] },
});
