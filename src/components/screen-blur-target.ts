import { createContext, type RefObject } from 'react';
import type { View } from 'react-native';

/** Reuse the tab's existing capture surface for menus, including native modals. */
export const ScreenBlurTargetContext = createContext<RefObject<View | null> | undefined>(undefined);
