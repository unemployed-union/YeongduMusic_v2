import { useMenuPreferences } from '@/stores/menu-preferences';
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { moveMenuItems, type MenuGroup, type MenuId } from './menu-layout';

type OrderPreview = {
  ids: MenuId[];
  pending: boolean;
  revision: number;
};

function sameOrder(left: MenuId[], right: MenuId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Keep a successful drag's row identities stable when storage acknowledges the same order. */
export function useMenuReordering(group: MenuGroup) {
  const { ready, loading, save } = useMenuPreferences(
    useShallow((state) => ({ ready: state.ready, loading: state.loading, save: state.reorder })),
  );
  const savedIds = useMenuPreferences(
    useShallow((state) => state.layout[group].map((item) => item.id)),
  );
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const pendingWrites = useRef(0);
  const submittedSnapshots = useRef(new Set<MenuId[]>());
  const matchesSaved = preview !== null && sameOrder(preview.ids, savedIds);
  const ids = preview && (preview.pending || matchesSaved) ? preview.ids : savedIds;
  const disabled = !ready || loading;

  function reorder(sourceIndices: number[], destination: number) {
    if (disabled || submittedSnapshots.current.has(ids)) {
      return;
    }
    const next = moveMenuItems(ids, sourceIndices, destination);
    if (next === ids) {
      return;
    }
    // Ignore a duplicate callback for the same native snapshot, but allow another drag
    // as soon as its new rows are displayed, even if a storage write is still pending.
    submittedSnapshots.current.add(ids);
    pendingWrites.current++;
    setPreview((current) => ({ ids: next, pending: true, revision: (current?.revision ?? 0) + 1 }));
    void save(group, next)
      .catch(() => {})
      .finally(() => {
        pendingWrites.current--;
        if (pendingWrites.current !== 0) {
          return;
        }
        submittedSnapshots.current.clear();
        const persisted = useMenuPreferences.getState().layout[group].map((item) => item.id);
        setPreview((current) => {
          if (!current) {
            return current;
          }
          const accepted = sameOrder(current.ids, persisted);
          return {
            ...current,
            pending: false,
            revision: accepted ? current.revision : current.revision + 1,
          };
        });
      });
  }

  return { ids, disabled, reorder, revision: preview?.revision ?? 0 };
}
