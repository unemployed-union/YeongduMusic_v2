import { create } from 'zustand';
import { emptyProfile, normalizeFolder } from '@/features/hidden-music/rules';
import { authenticateHiddenSettings } from '@/services/hidden-music/biometrics';
import { readHiddenProfile, writeHiddenProfile } from '@/services/hidden-music/storage';
import type { HiddenMusicProfile, HiddenPreset } from '@/types/hidden-music';

type HiddenState = {
  scope: string | null;
  ready: boolean;
  profile: HiddenMusicProfile;
  unlocked: boolean;
  busy: boolean;
  error: string | null;
  load: (scope: string | null) => Promise<void>;
  unlock: () => Promise<void>;
  lock: () => void;
  setBiometricLock: (enabled: boolean) => Promise<void>;
  savePreset: (preset: HiddenPreset) => Promise<void>;
  togglePreset: (id: string) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
  setPlaylistHidden: (id: string, hidden: boolean) => Promise<void>;
};

let generation = 0;
let authentication = 0;

export const useHiddenMusicStore = create<HiddenState>((set, get) => {
  function assertEditable() {
    const state = get();
    if (!state.ready || !state.scope) throw new Error('숨김 설정을 먼저 불러와 주세요. NAS 계정은 다시 로그인해야 할 수 있습니다.');
    if (state.busy) throw new Error('진행 중인 작업이 끝난 후 다시 시도해 주세요.');
    if (state.profile.biometricLock && !state.unlocked) throw new Error('생체 인증 또는 기기 암호로 숨김 설정을 먼저 열어 주세요.');
    return state;
  }
  async function persist(change: (profile: HiddenMusicProfile) => HiddenMusicProfile, verify = false) {
    const state = assertEditable();
    const current = generation;
    const auth = authentication;
    set({ busy: true, error: null });
    try {
      if (verify) await authenticateHiddenSettings();
      if (current !== generation || auth !== authentication) throw new Error('설정 화면이 잠겼습니다. 다시 열어 주세요.');
      const profile = change(state.profile);
      await writeHiddenProfile(state.scope!, profile);
      if (current === generation) set({ profile, unlocked: verify ? auth === authentication : get().unlocked });
    } catch (error) {
      if (current === generation) set({ error: error instanceof Error ? error.message : '숨김 설정을 저장하지 못했습니다.' });
      throw error;
    } finally {
      if (current === generation) set({ busy: false });
    }
  }
  return {
    scope: null, ready: false, profile: emptyProfile(), unlocked: false, busy: false, error: null,
    load: async (scope) => {
      const current = ++generation;
      ++authentication;
      set({ scope, ready: false, profile: emptyProfile(), unlocked: false, busy: false, error: null });
      try {
        const profile = scope ? await readHiddenProfile(scope) : emptyProfile();
        if (current === generation) set({ profile, ready: true });
      } catch (error) {
        if (current === generation) set({ error: error instanceof Error ? error.message : '숨김 설정을 불러오지 못했습니다.' });
      }
    },
    lock: () => { ++authentication; set({ unlocked: false }); },
    unlock: async () => {
      const state = get();
      if (!state.ready || !state.scope || state.busy) return;
      const current = generation;
      const auth = ++authentication;
      set({ busy: true, error: null });
      try {
        if (state.profile.biometricLock) await authenticateHiddenSettings();
        if (current === generation && auth === authentication) set({ unlocked: true });
      } catch (error) {
        if (current === generation) set({ error: error instanceof Error ? error.message : '인증을 완료하지 못했습니다.' });
      } finally {
        if (current === generation) set({ busy: false });
      }
    },
    setBiometricLock: (enabled) => persist((profile) => ({ ...profile, biometricLock: enabled }), enabled),
    savePreset: (preset) => {
      const clean = { ...preset, name: preset.name.trim(), songIds: [...new Set(preset.songIds)], folders: [...new Set(preset.folders.map(normalizeFolder))] };
      if (!clean.name || clean.name.length > 60) return Promise.reject(new Error('프리셋 이름을 1~60자로 입력해 주세요.'));
      if (!clean.songIds.length && !clean.folders.length) return Promise.reject(new Error('숨길 폴더나 곡을 하나 이상 선택해 주세요.'));
      return persist((profile) => ({ ...profile, presets: profile.presets.some((item) => item.id === clean.id) ? profile.presets.map((item) => item.id === clean.id ? clean : item) : [...profile.presets, clean] }));
    },
    togglePreset: (id) => persist((profile) => ({ ...profile, presets: profile.presets.map((preset) => preset.id === id ? { ...preset, enabled: !preset.enabled } : preset) })),
    removePreset: (id) => persist((profile) => ({ ...profile, presets: profile.presets.filter((preset) => preset.id !== id) })),
    setPlaylistHidden: (id, hidden) => {
      if (!id) return Promise.reject(new Error('플레이리스트를 확인해 주세요.'));
      return persist((profile) => ({ ...profile, hiddenPlaylistIds: hidden
        ? [...new Set([...(profile.hiddenPlaylistIds ?? []), id])]
        : (profile.hiddenPlaylistIds ?? []).filter((value) => value !== id) }));
    },
  };
});
