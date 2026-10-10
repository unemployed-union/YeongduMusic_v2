import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource, type AudioStatus } from 'expo-audio';
import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';
import type { Song } from '@/types/music';

export type EngineStatus = { playing: boolean; buffering: boolean; position: number; duration: number; ended: boolean; error: string | null };
export type RemoteTrackCommand = 'next' | 'previous';
export interface AudioEngine {
  load(source: AudioSource, song: Song): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): Promise<void>;
  subscribe(listener: (status: EngineStatus) => void): () => void;
  subscribeRemoteNavigation(listener: (command: RemoteTrackCommand) => void): () => void;
  release(): void;
}

// SDK 57 Android maps this to ExoPlayer's maximum forward buffer (seconds).
// Its default maximum is 50 seconds; leave startup/rebuffer thresholds to Expo.
const ANDROID_FORWARD_BUFFER_SECONDS = 120;

export class ExpoAudioEngine implements AudioEngine {
  // Expo Go cannot apply this app's expo-audio config plugin to its native binary.
  // executionEnvironment cannot distinguish Expo Go from an expo-dev-client build.
  private readonly backgroundPlaybackAvailable = Constants.appOwnership !== AppOwnership.Expo;
  private lifecycle = 0;
  private hasPlayed = false;
  private bufferingSince: number | null = null;
  private player: AudioPlayer | null = null;
  private configured: Promise<void> | null = null;
  private listeners = new Set<(status: EngineStatus) => void>();
  private subscription: { remove(): void } | null = null;

  private remoteSubscription: { remove(): void } | null = null;
  private remoteListeners = new Set<(command: RemoteTrackCommand) => void>();

  private async setup(): Promise<AudioPlayer> {
    const lifecycle = this.lifecycle;
    if (!this.configured) this.configured = setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: this.backgroundPlaybackAvailable, interruptionMode: 'doNotMix' });
    await this.configured;
    if (lifecycle !== this.lifecycle) throw new Error('재생 요청이 취소되었습니다.');
    if (!this.player) {
      this.player = createAudioPlayer(null, {
        updateInterval: 500,
        // iOS 57.0.5 applies this only to the constructor's initial AVPlayerItem,
        // not later replace() calls. This reusable player's improvement is Android-only.
        preferredForwardBufferDuration: Platform.OS === 'android' ? ANDROID_FORWARD_BUFFER_SECONDS : 0,
      });
      this.subscription = this.player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        this.observeBuffering(status);
        const normalized: EngineStatus = { playing: status.playing, buffering: status.isBuffering, position: status.currentTime, duration: status.duration, ended: status.didJustFinish, error: status.error };
        this.listeners.forEach((listener) => listener(normalized));
      });
      if (this.backgroundPlaybackAvailable && Platform.OS === 'android') {
        this.remoteSubscription = this.player.addListener('remoteTrackChange', ({ direction }) => {
          if (direction === 'next' || direction === 'previous') {
            this.remoteListeners.forEach((listener) => listener(direction));
          }
        });
      }
    }
    return this.player;
  }
  private resetBufferingObservation(): void {
    this.hasPlayed = false;
    this.bufferingSince = null;
  }

  private observeBuffering(status: AudioStatus): void {
    if (!__DEV__) return;
    if (status.error || status.didJustFinish) { this.resetBufferingObservation(); return; }
    // Measure reported buffering after playback has begun, excluding initial loading.
    // Never log URLs, headers, IDs or track metadata from authenticated sources.
    if (status.isBuffering) {
      if (this.hasPlayed && this.bufferingSince === null) {
        this.bufferingSince = performance.now();
        console.info('[Playback] Buffering started', { positionSeconds: Math.floor(status.currentTime) });
      }
    } else {
      if (this.bufferingSince !== null) {
        console.info('[Playback] Buffering ended', { durationMs: Math.round(performance.now() - this.bufferingSince) });
        this.bufferingSince = null;
      }
      this.hasPlayed = status.playing && status.currentTime > 0;
    }
  }

  async load(source: AudioSource, song: Song): Promise<void> {
    const lifecycle = this.lifecycle;
    const player = await this.setup();
    if (lifecycle !== this.lifecycle) return;
    this.resetBufferingObservation();
    player.replace(source);
    if (this.backgroundPlaybackAvailable) {
      // showSkip* and remoteTrackChange are provided by our pinned expo-audio pnpm patch.
      // Stock showSeek* options only move 10 seconds within the current song.
      player.setActiveForLockScreen(true,
        { title: song.title, artist: song.artist, albumTitle: song.album, artworkUrl: song.artworkUrl },
        Platform.OS === 'android'
          ? { showSkipPrevious: true, showSkipNext: true, showSeekBackward: false, showSeekForward: false }
          : undefined
      );
    }
    player.play();
  }
  play(): void { this.player?.play(); }
  pause(): void { this.resetBufferingObservation(); this.player?.pause(); }
  async seek(seconds: number): Promise<void> { this.resetBufferingObservation(); await this.player?.seekTo(seconds); }
  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  subscribeRemoteNavigation(listener: (command: RemoteTrackCommand) => void): () => void {
    this.remoteListeners.add(listener);
    return () => { this.remoteListeners.delete(listener); };
  }
  release(): void {
    this.lifecycle++;
    this.resetBufferingObservation();
    this.subscription?.remove();
    this.subscription = null;
    this.remoteSubscription?.remove();
    this.remoteSubscription = null;
    if (this.backgroundPlaybackAvailable) this.player?.setActiveForLockScreen(false);
    this.player?.release();
    this.player = null;
    this.configured = null;
  }
}
