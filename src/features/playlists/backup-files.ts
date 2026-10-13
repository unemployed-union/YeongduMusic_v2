import { pickBackupFile, saveBackupFile } from '@/features/settings/backup-files';
import { parsePlaylistBackup } from './backup-format';

export const savePlaylistBackup = (text: string) => saveBackupFile(text, 'yeongdu-music-playlists');
export const pickPlaylistBackup = () => pickBackupFile(parsePlaylistBackup);
