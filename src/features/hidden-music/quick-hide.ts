import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';

/** Apply the saved hidden selections before concealing their settings entry. */
export async function quickHide() {
  const access = useHiddenFeatureAccess.getState();
  if (!access.ready || !access.enabled || !access.quickHideEnabled) return;
  const privacy = useHiddenMusicStore.getState();
  if (access.quickHideMode === 'preset') await privacy.hideSelectedPreset();
  else await privacy.hideAll();
  const current = useHiddenMusicStore.getState();
  if (!current.ready || current.scope !== privacy.scope) throw new Error('계정이 변경되었습니다. 숨김 설정을 다시 확인해 주세요.');
  if (!await access.disable()) throw new Error(useHiddenFeatureAccess.getState().error ?? '설정을 저장하지 못했습니다. 다시 시도해 주세요.');
}
