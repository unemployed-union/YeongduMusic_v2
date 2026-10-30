import { createSerialQueue } from '@/services/async/serial-queue';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import {
  discover,
  login,
  SessionExpiredError,
  SynologyClient,
  type Session,
} from '@/services/synology/api';

const STORAGE_KEY = 'synology-music-session-v1';
type AuthState = {
  ready: boolean;
  mode: 'setup' | 'mock' | 'nas';
  session: Session | null;
  generation: number;
  notice: string | null;
  preferredAddress: string | null;
  bootstrap: () => Promise<void>;
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
  const { run: storageTask } = createSerialQueue();
  function begin(): number {
    const generation = get().generation + 1;
    set({ generation });
    return generation;
  }
  const isCurrent = (generation: number) => get().generation === generation;
  function assertCurrent(generation: number): void {
    if (!isCurrent(generation)) throw new Error('인증 요청이 취소되었습니다.');
  }
  async function writeStored(value: string | null): Promise<void> {
    if (value === null) await SecureStore.deleteItemAsync(STORAGE_KEY);
    else await SecureStore.setItemAsync(STORAGE_KEY, value);
  }
  function replaceStored(
    generation: number,
    value: string | null,
    commit?: () => void,
  ): Promise<void> {
    return storageTask(async () => {
      if (!isCurrent(generation)) return;
      const previous = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!isCurrent(generation)) return;
      await writeStored(value);
      // Native writes cannot be cancelled. Restore before allowing any newer
      // storage task to run, so an obsolete write/delete cannot survive it.
      if (!isCurrent(generation)) await writeStored(previous);
      else commit?.();
    });
  }
  return {
    ready: false,
    mode: 'setup',
    session: null,
    generation: 0,
    notice: null,
    preferredAddress: null,
    bootstrap: async () => {
      if (get().ready) return;
      const generation = begin();
      let savedAddress: string | null = null;
      try {
        const stored = await storageTask(() => SecureStore.getItemAsync(STORAGE_KEY));
        if (!isCurrent(generation)) return;
        if (!stored) {
          set({ ready: true });
          return;
        }
        const saved = JSON.parse(stored) as Pick<Session, 'baseUrl' | 'sid' | 'token' | 'account'>;
        if (
          typeof saved.baseUrl !== 'string' ||
          typeof saved.sid !== 'string' ||
          (saved.account !== undefined && typeof saved.account !== 'string')
        )
          throw new Error('Invalid stored session');
        savedAddress = saved.baseUrl;
        const apis = await discover(saved.baseUrl);
        if (!isCurrent(generation)) return;
        const session = { ...saved, apis };
        await new SynologyClient(session).checkSession();
        if (isCurrent(generation))
          set({
            ready: true,
            mode: 'nas',
            session,
            notice: null,
            preferredAddress: session.baseUrl,
          });
      } catch (error) {
        if (!isCurrent(generation)) return;
        await replaceStored(generation, null).catch(() => {});
        if (isCurrent(generation))
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
    },
    connect: async (address, account, password, otp, allowHttp) => {
      const generation = begin();
      const session = await login(address, account.trim(), password, otp, allowHttp);
      assertCurrent(generation);
      try {
        await new SynologyClient(session).checkSession();
      } catch (error) {
        // An obsolete login must not log out a newer NAS session either.
        if (isCurrent(generation)) await new SynologyClient(session).logout().catch(() => {});
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
    },
    useMock: () => {
      begin();
      set({ ready: true, mode: 'mock', session: null, notice: null });
    },
    expire: async (session, expectedGeneration) => {
      if (get().session !== session || !isCurrent(expectedGeneration)) return;
      const generation = begin();
      await replaceStored(generation, null).catch(() => {});
      if (isCurrent(generation))
        set({
          ready: true,
          mode: 'setup',
          session: null,
          notice: 'NAS 인증을 확인할 수 없습니다. 다시 로그인해 주세요.',
        });
    },
    disconnect: async (nextAddress) => {
      const session = get().session;
      const generation = begin();
      if (session) await new SynologyClient(session).logout().catch(() => {});
      if (!isCurrent(generation)) return;
      await replaceStored(generation, null).catch(() => {});
      if (isCurrent(generation))
        set({
          ready: true,
          mode: 'setup',
          session: null,
          notice: null,
          preferredAddress: nextAddress ?? null,
        });
    },
  };
});
