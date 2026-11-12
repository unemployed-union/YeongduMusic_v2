import { useRef, useState } from 'react';
import { useGoogleDriveStore } from '@/stores/google-drive';

export function useDriveFilePicker(onClose: () => void) {
  const files = useGoogleDriveStore((state) => state.files);
  const saving = useGoogleDriveStore((state) => state.fileSaving);
  const [ids, setIds] = useState(() => new Set(files.map((file) => file.id)));
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const changed = files.some((file) => !ids.has(file.id));
  const close = () => {
    if (!pending.current) {
      onClose();
    }
  };
  async function save() {
    if (pending.current || saving || !changed) {
      return;
    }
    pending.current = true;
    setError(null);
    try {
      await useGoogleDriveStore.getState().selectFiles(files.filter((file) => ids.has(file.id)));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '선택 목록을 저장하지 못했습니다.');
    } finally {
      pending.current = false;
    }
  }
  return { files, saving, ids, setIds, error, setError, changed, close, save };
}
