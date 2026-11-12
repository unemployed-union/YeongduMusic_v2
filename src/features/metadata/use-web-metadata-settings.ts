import { useEffect, useMemo, useState } from 'react';
import { useWebMetadataStore } from '@/stores/web-metadata';
import { useAuthStore } from '@/stores/auth';
import { useSongs } from '@/features/library/queries';
import { privacyScope } from '@/features/hidden-music/rules';
import { normalizeMetadataText } from './web-rules';

export function useWebMetadataSettings() {
  const preferences = useWebMetadataStore();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const scope = privacyScope(mode, session);
  const { data, isPending, error } = useSongs(expanded);
  const load = preferences.load;
  useEffect(() => {
    void load();
  }, [load]);
  const matching = useMemo(() => {
    const term = normalizeMetadataText(search);
    return (data?.items ?? []).filter(
      (song) =>
        !term || normalizeMetadataText(`${song.title} ${song.artist} ${song.album}`).includes(term),
    );
  }, [data?.items, search]);
  const disabled = !preferences.ready || preferences.loading || preferences.loadError;
  return {
    preferences,
    expanded,
    setExpanded,
    search,
    setSearch,
    scope,
    isPending,
    error,
    matching,
    disabled,
    load,
  };
}
