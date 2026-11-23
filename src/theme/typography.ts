import { Platform } from 'react-native';

export const androidFontFamily = Platform.OS === 'android' ? 'Pretendard JP Variable' : undefined;

export const androidTextStyle = androidFontFamily ? { fontFamily: androidFontFamily } : undefined;

