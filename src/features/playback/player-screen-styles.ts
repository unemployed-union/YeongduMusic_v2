import { StyleSheet } from 'react-native';
const SIDE_PADDING = 29;
// Retain the original Android footer geometry.
const PLAYER_FOOTER_SPACE = 44 + 31;
export const glassTopButton = {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: '#FFFFFF12',
};
export const playerScreenStyles = StyleSheet.create({
  player: { flex: 1 },
  body: { flex: 1, minHeight: 0, alignSelf: 'center' },
  primaryContent: { flexGrow: 1 },
  secondary: { flex: 1, minWidth: 0 },
  compactBottom: { paddingBottom: 8 },
  artContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, paddingHorizontal: SIDE_PADDING, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topButton: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  artShadow: {
    borderRadius: 17,
    shadowColor: '#070310',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 24,
    elevation: 18,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: 'white' },
  bottom: { paddingBottom: 15 + PLAYER_FOOTER_SPACE },
  iosBottom: { paddingBottom: 56 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 19 },
  title: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  artistButton: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 3 },
  artist: { fontSize: 17, color: '#FFFFFFB0' },
  menuButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  error: { color: '#FFE2E7', fontSize: 12, marginBottom: 5 },
  queue: { flex: 1, paddingTop: 25 },
  queueHeading: { color: 'white', fontSize: 21, fontWeight: '800', marginBottom: 11 },
  queueContent: { paddingTop: 28, paddingBottom: 28 },
  queueRow: {
    height: 61,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FFFFFF33',
  },
  queueTitle: { color: 'white', fontSize: 15, fontWeight: '700' },
  queueArtist: { color: '#FFFFFFA8', fontSize: 12, marginTop: 3 },
});
