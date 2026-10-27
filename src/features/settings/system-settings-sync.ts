import schema from './ios-settings-schema.json';
import type { ThemeMode } from '@/theme/mode';
import type { StreamingQuality } from '@/types/music';
import type { HapticPreferences } from '@/features/haptics/preferences';
import type { BlurPreferences } from './blur-preferences';

export type SystemAppPreferences = { theme: ThemeMode; quality: StreamingQuality; hideArtwork: boolean; haptics: HapticPreferences; blur: BlurPreferences };
type Values = Record<string, unknown>;
type Item = { key: string; path: string[]; type: string; values?: readonly string[] };
export const SYSTEM_SETTINGS_ITEMS = schema.groups.flatMap<Item>(group => group.items);
export const SYSTEM_SETTINGS_KEYS = SYSTEM_SETTINGS_ITEMS.map(item => item.key);

function valid(item: Item, value: unknown): boolean {
  if (item.type === 'toggle') return typeof value === 'boolean';
  if (item.type === 'slider') return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100;
  return typeof value === 'string' && item.values?.includes(value) === true;
}
function normalized(item: Item, value: unknown) { return item.type === 'slider' ? Math.round(value as number) : value; }
export function flattenSystemPreferences(preferences: SystemAppPreferences): Values {
  return Object.fromEntries(SYSTEM_SETTINGS_ITEMS.map(item => [item.key, item.path.reduce<unknown>((value, key) => (value as Values)[key], preferences)]));
}
function applyValues(preferences: SystemAppPreferences, values: Values): SystemAppPreferences {
  const result = JSON.parse(JSON.stringify(preferences)) as Values;
  for (const item of SYSTEM_SETTINGS_ITEMS) if (item.key in values) {
    const parent = item.path.slice(0, -1).reduce<Values>((value, key) => value[key] as Values, result);
    parent[item.path.at(-1)!] = values[item.key];
  }
  return result as unknown as SystemAppPreferences;
}

export interface SystemSettingsPorts {
  load(): Promise<void>;
  snapshot(): SystemAppPreferences;
  apply(preferences: SystemAppPreferences): Promise<void>;
  read(): Values;
  write(values: Values): void;
  subscribe(listener: () => void): () => void;
  watch(listener: () => void): () => void;
  status(ready: boolean, error: string | null): void;
}

/** Serialize external edits and backup restores; write only changed app-owned keys. */
export function startSystemSettingsSync(ports: SystemSettingsPorts) {
  let stopped = false, initialized = false, refreshQueued = false;
  let expected: Values | null = null;
  let previous = flattenSystemPreferences(ports.snapshot());
  let tail = Promise.resolve();
  const enqueue = (operation: () => Promise<void> | void) => {
    tail = tail.then(async () => { if (!stopped) await operation(); }).catch(() => {
      if (!stopped) ports.status(true, 'iOS 설정을 반영하지 못했습니다. 다시 시도해 주세요.');
    });
    return tail;
  };
  const refresh = () => {
    if (refreshQueued || stopped) return tail;
    refreshQueued = true;
    return enqueue(async () => {
      refreshQueued = false;
      await ports.load();
      if (stopped) return;
      const native = ports.read(), app = ports.snapshot(), current = flattenSystemPreferences(app);
      const target: Values = {}, repair = new Set<string>();
      for (const item of SYSTEM_SETTINGS_ITEMS) {
        if (valid(item, native[item.key])) target[item.key] = normalized(item, native[item.key]);
        else repair.add(item.key);
      }
      // Expected notifications from our imports must not echo older values back
      // over a second edit made in Settings while persistence is still running.
      expected = target;
      try { await ports.apply(applyValues(app, target)); }
      finally { expected = null; }
      if (stopped) return;
      const actual = flattenSystemPreferences(ports.snapshot());
      for (const key of Object.keys(target)) if (actual[key] !== target[key]) throw new Error('Preference persistence failed');
      const latest = ports.read(), seed: Values = {};
      for (const item of SYSTEM_SETTINGS_ITEMS) {
        if (repair.has(item.key) && !valid(item, latest[item.key])) seed[item.key] = actual[item.key] ?? current[item.key];
      }
      // Seed absent keys from existing preferences, including partial upgrades.
      // Valid Settings edits made before the app's first launch always win.
      if (Object.keys(seed).length) ports.write(seed);
      previous = actual;
      initialized = true;
      ports.status(true, null);
    });
  };
  const unsubscribe = ports.subscribe(() => {
    const next = flattenSystemPreferences(ports.snapshot()), changes: Values = {};
    for (const item of SYSTEM_SETTINGS_ITEMS) if (next[item.key] !== previous[item.key]
      && valid(item, next[item.key]) && (!expected || next[item.key] !== expected[item.key])) changes[item.key] = next[item.key];
    previous = next;
    if (initialized && Object.keys(changes).length) void enqueue(() => {
      ports.write(changes);
      ports.status(true, null);
    });
  });
  const unwatch = ports.watch(() => { void refresh(); });
  void refresh();
  return { refresh, settled: () => tail, stop: () => { stopped = true; unsubscribe(); unwatch(); } };
}
