import { createContext, type RefObject } from 'react';
import type { ViewInstance } from 'react-native';

/** Reuse the tab's existing capture surface for menus, including native modals. */
export const ScreenBlurTargetContext = createContext<RefObject<ViewInstance | null> | undefined>(undefined);
