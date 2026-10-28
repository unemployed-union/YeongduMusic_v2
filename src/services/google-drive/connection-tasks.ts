interface Options {
  isCurrent(generation: number): boolean;
  getSignal(): AbortSignal;
  isBusy(): boolean;
  onProgress(label: string): void;
}

/** Native promises remain a barrier after a UI timeout or cancellation. */
export function createConnectionTaskRunner({ isCurrent, getSignal, isBusy, onProgress }: Options) {
  let pendingOperation: Promise<unknown> | null = null;
  async function deadline<T>(
    promise: Promise<T>,
    label: string,
    milliseconds: number,
    signal: AbortSignal,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = () => {};
    const expires = Date.now() + milliseconds;
    const timeout = () =>
      new Error(
        label === '이전 인증 요청 대기'
          ? 'Google 이전 인증 요청이 끝나지 않았습니다. Google 인증 창을 닫아 주세요. 계속되면 앱을 완전히 종료한 뒤 다시 연결해 주세요.'
          : `Google ${label} 시간이 초과되었습니다. 네트워크와 Google 인증 창을 확인한 뒤 다시 시도해 주세요.`,
      );
    try {
      const result = await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error('Google 연결 요청이 변경되거나 취소되었습니다.'));
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
          timer = setTimeout(() => reject(timeout()), milliseconds);
        }),
      ]);
      if (Date.now() >= expires) throw timeout();
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
  async function step<T>(
    generation: number,
    label: string,
    job: () => Promise<T>,
    milliseconds = 30000,
  ): Promise<T> {
    const check = () => {
      if (!isCurrent(generation)) throw new Error('Google 연결 요청이 변경되거나 취소되었습니다.');
    };
    check();
    const signal = getSignal();
    if (pendingOperation) {
      onProgress('이전 인증 요청 종료 대기');
      await deadline(
        pendingOperation.then(
          () => {},
          () => {},
        ),
        '이전 인증 요청 대기',
        30000,
        signal,
      );
      check();
    }
    if (isBusy()) onProgress(label);
    const operation = Promise.resolve().then(() => {
      check();
      return job();
    });
    pendingOperation = operation;
    const clear = () => {
      if (pendingOperation === operation) pendingOperation = null;
    };
    void operation.then(clear, clear);
    const result = await deadline(operation, label, milliseconds, signal);
    check();
    return result;
  }
  return { step };
}
