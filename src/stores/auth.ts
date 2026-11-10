import { createSerialQueue } from '@/services/async/serial-queue';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import {
  discover,
  login,
  SessionExpiredError,
  SynologyClient,
  SynologyRequestError,
  type Session,
} from '@/services/synology/api';
import { cacheNasApis, readCachedNasApis } from '@/services/synology/discovery-cache';

const STORAGE_KEY = 'synology-music-session-v1';
type AuthState = {
  ready: boolean;
  mode: 'setup' | 'mock' | 'nas';
  session: Session | null;
  generation: number;
  notice: string | null;
  preferredAddress: string | null;
  bootstrap: () => Promise<void>;
  ensureApis: () => Promise<void>;
  connect: (
    address: string,
    account: string,
    password: string,
    otp?: string,
    allowHttp?: boolean,
  ) => Promise<void>;
  useMock: () => void;
  expire: (session: Session, generation: number) => Promise<void>;
  disconnect: (nextAddress?: string) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => {
  let discovery: { generation: number; work: Promise<void> } | undefined;
  const { run: storageTask } = createSerialQueue();
  function begin(): number {
    const generation = get().generation + 1;
    set({ generation });
    return generation;
  }
  const isCurrent = (generation: number) => get().generation === generation;
  function assertCurrent(generation: number): void {
    if (!isCurrent(generation)) {
      throw new Error('인증 요청이 취소되었습니다.');
    }
  }
  async function writeStored(value: string | null): Promise<void> {
    if (value === null) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, value);
    }
  }
  function replaceStored(
    generation: number,
    value: string | null,
    commit?: () => void,
  ): Promise<void> {
    return storageTask(async () => {
      if (!isCurrent(generation)) {
        return;
      }
      const previous = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!isCurrent(generation)) {
        return;
      }
      await writeStored(value);
      // Native writes cannot be cancelled. Restore before allowing any newer
      // storage task to run, so an obsolete write/delete cannot survive it.
      if (!isCurrent(generation)) {
        await writeStored(previous);
      } else {
        commit?.();
      }
    });
  }
  return {
    ready: false,
    mode: 'setup',
    session: null,
    generation: 0,
    notice: null,
    preferredAddress: null,
    ensureApis: async () => {
      const { session, generation } = get();
      if (!session || session.apis['SYNO.AudioStation.Song']) {
        return;
      }
      if (discovery?.generation === generation) {
        return discovery.work;
      }
      const work = (async () => {
        const apis = await discover(session.baseUrl);
        if (!isCurrent(generation) || get().session !== session) {
          throw new Error('NAS 연결 확인이 취소되었습니다.');
        }
        set({ session: { ...session, apis } });
        await cacheNasApis(session.baseUrl, apis).catch(() => {});
      })();
      discovery = { generation, work };
      try {
        await work;
      } finally {
        if (discovery?.work === work) {
          discovery = undefined;
        }
      }
    },
    bootstrap: async () => {
      if (get().ready) {
        return;
      }
      const generation = begin();
      let savedAddress: string | null = null;
      let restored: Session | null = null;
      try {
        const stored = await storageTask(() => SecureStore.getItemAsync(STORAGE_KEY));
        if (!isCurrent(generation)) {
          return;
        }
        if (!stored) {
          set({ ready: true });
          return;
        }
        const saved = JSON.parse(stored) as Pick<Session, 'baseUrl' | 'sid' | 'token' | 'account'>;
        if (
          typeof saved.baseUrl !== 'string' ||
          typeof saved.sid !== 'string' ||
          (saved.account !== undefined && typeof saved.account !== 'string')
        ) {
          throw new Error('Invalid stored session');
        }
        savedAddress = saved.baseUrl;
        const apis = await readCachedNasApis(saved.baseUrl).catch(() => null);
        if (!isCurrent(generation)) {
          return;
        }
        restored = { ...saved, apis: apis ?? {} };
        set({ ready: true, mode: 'nas', session: restored, notice: null, preferredAddress: saved.baseUrl });
        await get().ensureApis();
        if (!isCurrent(generation) || !get().session) {
          return;
        }
        const session = get().session!;
        await new SynologyClient(session).checkSession();
        if (isCurrent(generation)) {
          set({
            ready: true,
            mode: 'nas',
            session,
            notice: null,
            preferredAddress: session.baseUrl,
          });
        }
      } catch (error) {
        if (!isCurrent(generation)) {
          return;
        }
        const expired = error instanceof SessionExpiredError ||
          (error instanceof SynologyRequestError && error.httpStatus === 401);
        if (restored && !expired) {
          set({ ready: true, notice: 'NAS 연결을 확인하지 못했습니다. 저장된 음악을 사용하며 다시 연결을 시도할 수 있습니다.' });
          return;
        }
        await replaceStored(generation, null).catch(() => {});
        if (isCurrent(generation)) {
          set({
            ready: true,
            mode: 'setup',
            session: null,
            preferredAddress: savedAddress,
            notice:
              error instanceof SessionExpiredError
                ? error.message
                : '저장된 NAS 연결을 확인할 수 없습니다. 다시 로그인해 주세요.',
          });
        }
      }
    },
    connect: async (address, account, password, otp, allowHttp) => {
      const generation = begin();
      const session = await login(address, account.trim(), password, otp, allowHttp);
      assertCurrent(generation);
      try {
        await new SynologyClient(session).checkSession();
      } catch (error) {
        // An obsolete login must not log out a newer NAS session either.
        if (isCurrent(generation)) {
          await new SynologyClient(session).logout().catch(() => {});
        }
        throw error;
      }
      assertCurrent(generation);
      await replaceStored(
        generation,
        JSON.stringify({
          baseUrl: session.baseUrl,
          sid: session.sid,
          token: session.token,
          account: session.account,
        }),
        () => {
          set({
            ready: true,
            session,
            mode: 'nas',
            notice: null,
            preferredAddress: session.baseUrl,
          });
        },
      );
      assertCurrent(generation);
      await cacheNasApis(session.baseUrl, session.apis).catch(() => {});
      assertCurrent(generation);
    },
    useMock: () => {
      begin();
      set({ ready: true, mode: 'mock', session: null, notice: null });
    },
    expire: async (session, expectedGeneration) => {
      if (get().session !== session || !isCurrent(expectedGeneration)) {
        return;
      }
      const generation = begin();
      await replaceStored(generation, null).catch(() => {});
      if (isCurrent(generation)) {
        set({
          ready: true,
          mode: 'setup',
          session: null,
          notice: 'NAS 인증을 확인할 수 없습니다. 다시 로그인해 주세요.',
        });
      }
    },
    disconnect: async (nextAddress) => {
      const session = get().session;
      const generation = begin();
      if (session) {
        await new SynologyClient(session).logout().catch(() => {});
      }
      if (!isCurrent(generation)) {
        return;
      }
      await replaceStored(generation, null).catch(() => {});
      if (isCurrent(generation)) {
        set({
          ready: true,
          mode: 'setup',
          session: null,
          notice: null,
          preferredAddress: nextAddress ?? null,
        });
      }
    },
  };
});
