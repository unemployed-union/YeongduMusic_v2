export type ImportKind = 'files' | 'device' | 'folder';
export type ImportAsset = {
  uri: string;
  name: string;
  mimeType?: string;
  duration?: number;
  stage?: boolean;
  temporary?: boolean;
  originFolder?: string;
};
export type ImportResult = {
  added: number;
  duplicates: number;
  failures: string[];
  cancelled?: boolean;
  excluded?: number;
};
