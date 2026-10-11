export type PlaylistPreset = { id: string; name: string; songIds: string[] };
export type PlaylistProfile = { version: 1; presets: PlaylistPreset[] };
