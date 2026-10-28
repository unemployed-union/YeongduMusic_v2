/** Run operations in order without letting one rejection block later work. */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return { run, settled: () => tail };
}
