export type HiddenPreset = {
  id: string;
  name: string;
  enabled: boolean;
  songIds: string[];
  folders: string[];
};

export type HiddenMusicProfile = {
  version: 1;
  biometricLock: boolean;
  presets: HiddenPreset[];
};
