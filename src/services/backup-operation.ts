let working = false;

export async function withBackupOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (working) throw new Error('백업 또는 복구 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  working = true;
  try { return await operation(); } finally { working = false; }
}
