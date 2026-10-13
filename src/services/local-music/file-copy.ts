import * as FileSystem from 'expo-file-system/legacy';

type Fingerprint = { size: number; digest: string; id: string };

export async function fingerprintFile(uri: string, message: string): Promise<Fingerprint> {
  const info = await FileSystem.getInfoAsync(uri, { md5: true });
  if (!info.exists || info.isDirectory || !info.size || !info.md5 || !/^[a-f0-9]{32}$/i.test(info.md5)) throw new Error(message);
  const digest = info.md5.toLowerCase();
  return { size: info.size, digest, id: 'local:' + digest + ':' + info.size };
}

/** Remove only a newly created app copy if verification or metadata publication fails. */
export async function withVerifiedCopy<T>(
  options: { from: string; to: string; fingerprint: Fingerprint; message: string; overwrite?: boolean; check?: () => void },
  publish: () => Promise<T>,
): Promise<T> {
  const { from, to, fingerprint, message, overwrite, check } = options;
  check?.();
  const existing = await FileSystem.getInfoAsync(to);
  const created = !existing.exists;
  try {
    if (overwrite || !existing.exists || existing.isDirectory || existing.size !== fingerprint.size) await FileSystem.copyAsync({ from, to });
    const copied = await FileSystem.getInfoAsync(to, { md5: true });
    if (!copied.exists || copied.isDirectory || copied.size !== fingerprint.size || copied.md5?.toLowerCase() !== fingerprint.digest) throw new Error(message);
    check?.();
    return await publish();
  } catch (error) {
    if (created) await FileSystem.deleteAsync(to, { idempotent: true }).catch(() => {});
    throw error;
  }
}
