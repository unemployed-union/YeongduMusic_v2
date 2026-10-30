/** A deadline covers credential acquisition, headers, body and synchronous parsing. */
export class CloudRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CloudRequestError';
  }
}
export async function cloudRequest<T>(
  label: string,
  work: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  error: (message: string) => CloudRequestError = (message) => new CloudRequestError(message),
  timeoutMs = 15000,
): Promise<T> {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  let rejectAbort: () => void = () => {};
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) {
    cancel();
  }
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort();
    }
  }, timeoutMs);
  const cancelled = () =>
    error(label + (timedOut ? ' 요청 시간이 초과되었습니다.' : ' 요청이 취소되었습니다.'));
  try {
    if (controller.signal.aborted) {
      throw cancelled();
    }
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(cancelled());
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    const completed = (async () => {
      const result = await work(controller.signal);
      if (controller.signal.aborted) {
        throw cancelled();
      }
      if (Date.now() >= deadline) {
        throw error(label + ' 요청 시간이 초과되었습니다.');
      }
      return result;
    })();

    return await Promise.race([aborted, completed]);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw cancelled();
    }
    if (cause instanceof CloudRequestError) {
      throw cause;
    }
    throw error(label + '에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
