import { StyleSheet } from 'react-native';

export const glassControlStyles = StyleSheet.create({
  button: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, overflow: 'hidden' },
  segments: {
    marginHorizontal: 22,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 24,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderWidth: 0,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
