import type { GradientColors } from './artwork-colors';

export type BackgroundLayer = { id: number; colors: GradientColors; animate: boolean };
export type BackgroundAction = { type: 'target'; colors: GradientColors } | { type: 'complete'; id: number };

export function sameGradient(a: GradientColors, b: GradientColors): boolean {
  return a.every((color, index) => color === b[index]);
}

export function initialBackgroundLayers(colors: GradientColors): BackgroundLayer[] {
  return [{ id: 0, colors, animate: false }];
}

export function backgroundLayers(layers: BackgroundLayer[], action: BackgroundAction): BackgroundLayer[] {
  const latest = layers[layers.length - 1];
  if (action.type === 'complete') {
    // An old animation must never remove the newer layer. Prune only beneath an opaque top.
    return latest.id === action.id && layers.length > 1 ? [latest] : layers;
  }
  if (sameGradient(latest.colors, action.colors)) return layers;
  // Existing layers/opacity stay untouched: the new layer starts transparent on mount.
  return [...layers, { id: latest.id + 1, colors: action.colors, animate: true }];
}
