import { APPEARANCE_FIELDS, APPEARANCE_LABELS } from '@/theme/appearance';
import { Button, Text } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { BLUR_AREAS, BLUR_LABELS } from './blur-preferences';
import { SettingsFeedback, SettingsNote, SettingsToggle } from './ios/controls';
import { MENU_LABELS, visibleMenuIds } from './menu-layout';
import { SettingsPage, SettingsSection } from './settings-ui';
import { useBackupSettings } from './use-backup-settings';

export function BackupSettings() {
  const state = useBackupSettings();
  const { selected, busy } = state;
  const preferences = selected?.backup.preferences;
  return (
    <SettingsPage>
      <SettingsSection
        title="백업"
        nativeContent
        description="설정과 가져오기 제외 폴더를 JSON 파일로 저장합니다. 음악 파일, 로그인 암호·인증 정보와 현재 재생 대기열은 포함하지 않습니다. 백업에는 폴더 경로와 포함한 프리셋 이름·숨김 목록이 저장됩니다. 계정 설정이 잠겨 있으면 기기 인증이 필요합니다."
      >
        {state.access.ready && state.access.enabled && (
          <SettingsToggle
            label="프리셋과 숨김 설정 포함"
            value={state.includeAccount}
            disabled={busy}
            onChange={state.setIncludeAccount}
          />
        )}
        <Button label="설정 백업하기" modifiers={[unavailable(busy)]} onPress={state.backup} />
      </SettingsSection>
      <SettingsSection
        title="복구"
        nativeContent
        description="파일을 선택하면 복구할 내용을 확인할 수 있습니다. 확인 후 복구하기를 선택하면 백업의 설정을 적용합니다."
      >
        <Button label="백업 파일 선택" modifiers={[unavailable(busy)]} onPress={state.choose} />
      </SettingsSection>
      {selected && preferences && (
        <SettingsSection
          title={selected.name}
          nativeContent
          description="복구하면 표시된 설정을 백업 내용으로 덮어씁니다. 제외 폴더와 숨김 설정에 따라 보관함과 재생 중인 곡이 바뀔 수 있습니다."
        >
          <Text>{`백업 날짜: ${new Date(selected.backup.exportedAt).toLocaleString()}`}</Text>
          <Text>{`화면 모드: ${state.themeModePreview}`}</Text>
          <Text>{`탐색 후 자동 재생: ${state.playOnSeekPreview}`}</Text>
          <Text>{`앨범 제목만으로 묶기: ${state.albumGroupingPreview}`}</Text>
          <Text>{`앨범아트: ${preferences.hideArtwork ? '숨김' : '표시'} · 폴더 앨범: ${preferences.includeFolderAlbums ? '표시' : '숨김'}`}</Text>
          <Text>{`음질: ${preferences.quality === 'mp3' ? 'MP3' : '원본'} · 제외 폴더: ${preferences.excludedFolders.length}개`}</Text>
          <Text>{`보관함 상세 화면: ${preferences.libraryDetails ? `아티스트 사진 ${preferences.libraryDetails.artistPhotos ? '켬' : '끔'} · 앨범 색상 ${preferences.libraryDetails.albumColors ? '켬' : '끔'}` : '현재 설정 유지'}`}</Text>
          <Text>{`블러 효과: ${state.blurPreview}`}</Text>
          {state.selectedBlur && (
            <SettingsNote>
              {BLUR_AREAS.map((area) => {
                const option = state.selectedBlur!.areas[area];
                return `${BLUR_LABELS[area]} ${option.enabled ? '켬' : '끔'} · 강도 ${option.intensity}`;
              }).join('\n')}
            </SettingsNote>
          )}
          <SettingsNote>
            {preferences.appearance
              ? APPEARANCE_FIELDS.map(
                  (field) =>
                    `${APPEARANCE_LABELS[field]}: ${preferences.appearance![field] ?? '기본'}`,
                ).join('\n')
              : '색상 설정: 현재 설정 유지'}
          </SettingsNote>
          <SettingsNote>
            {preferences.favoriteDisplay
              ? `좋아요 버튼: 전체 ${preferences.favoriteDisplay.enabled ? '켬' : '끔'} · 노래 ${preferences.favoriteDisplay.songs ? '켬' : '끔'} · 재생 화면 ${preferences.favoriteDisplay.player ? '켬' : '끔'} · 앨범 ${preferences.favoriteDisplay.album ? '켬' : '끔'}`
              : '좋아요 버튼: 현재 설정 유지'}
          </SettingsNote>
          {preferences.menus && (
            <SettingsNote>
              {(['bottom', 'library', 'player'] as const)
                .map(
                  (group) =>
                    `${{ bottom: '하단', library: '보관함', player: '재생 화면' }[group]} 메뉴: ${visibleMenuIds(
                      preferences.menus![group],
                    )
                      .map((id) => MENU_LABELS[id])
                      .join(' → ')}`,
                )
                .join('\n')}
            </SettingsNote>
          )}
          {selected.backup.account && (
            <>
              <SettingsToggle
                label="프리셋과 숨김 설정도 복구"
                value={state.restoreAccount}
                disabled={state.restoreAccountDisabled}
                onChange={state.setRestoreAccount}
              />
              <SettingsNote>{`음악 프리셋 ${selected.backup.account.hidden.presets.length}개 · 플레이리스트 ${selected.backup.account.playlists.presets.length}개. 같은 서버·NAS 계정에서만 복구할 수 있으며 기타 메뉴와 빠른 숨기기 설정도 바뀝니다.`}</SettingsNote>
            </>
          )}
          <Button label="설정 복구하기" modifiers={[unavailable(busy)]} onPress={state.restore} />
          <Button
            label="취소"
            modifiers={[unavailable(busy)]}
            onPress={() => {
              if (!busy) {
                state.setSelected(null);
                state.setRestoreAccount(false);
              }
            }}
          />
        </SettingsSection>
      )}
      {(busy || state.error || state.message) && (
        <SettingsSection title="작업 상태" nativeContent>
          <SettingsFeedback loading={busy} error={state.error} />
          {state.message && <SettingsNote>{state.message}</SettingsNote>}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
