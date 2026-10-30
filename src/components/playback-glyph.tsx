import Ionicons from '@expo/vector-icons/Ionicons';

/** The same unframed playback symbol in the mini and full-screen iOS players. */
export function PlaybackGlyph({
  playing,
  color,
  size = 22,
}: {
  playing: boolean;
  color: string;
  size?: number;
}) {
  const box = size + 4;
  return (
    <Ionicons
      name={playing ? 'pause' : 'play'}
      size={size}
      color={color}
      allowFontScaling={false}
      style={{
        width: box,
        height: box,
        lineHeight: box,
        textAlign: 'center',
        includeFontPadding: false,
        transform: [{ translateX: playing ? 0 : size / 22 }],
      }}
    />
  );
}
