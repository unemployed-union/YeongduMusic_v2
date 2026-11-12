import { useState } from 'react';
import { Alert } from 'react-native';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';

export function useGoogleDriveSettings() {
  const drive = useGoogleDriveStore();
  const documentsBusy = useDriveDocumentsStore((state) => state.busy);
  const apiBusy = drive.busy || drive.loading || drive.fileSaving;
  const busy = apiBusy || documentsBusy;
  const [filePicker, setFilePicker] = useState(false);
  function connect() {
    Alert.alert(
      'Google Drive 연결',
      'Google에서 직접 선택해 허용한 음악 파일만 불러옵니다. 선택한 파일 관리 권한(drive.file)을 요청하며, 앱은 음악과 태그를 읽어 재생하고 기기에 보관합니다. Drive 원본 파일은 수정하거나 삭제하지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '연결',
          onPress: () => {
            void drive.connect();
          },
        },
      ],
    );
  }
  let progressLabel = drive.progress;
  if (progressLabel === null || progressLabel === undefined) {
    if (drive.loading) {
      progressLabel = '음악 목록 불러오는 중';
    } else if (drive.fileSaving) {
      progressLabel = '음악 선택 목록 저장 중';
    } else {
      progressLabel = 'Google 연결 준비 중';
    }
  }

  return { drive, apiBusy, busy, filePicker, setFilePicker, connect, progressLabel };
}
