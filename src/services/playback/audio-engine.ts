import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource, type AudioStatus } from 'expo-audio';
import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';
import type { Song } from '@/types/music';
import { validatePlaybackRate } from './playback-rate';

export type EngineStatus = { playing: boolean; buffering: boolean; position: number; duration: number; ended: boolean; error: string | null };
export type RemoteTrackCommand = 'next' | 'previous';
export interface AudioEngine {
  load(source: AudioSource, song: Song, initialPosition?: number): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number, precise?: boolean): Promise<void>;
  getPosition(): number;
  setPlaybackRate(rate: number): void;
  setPreservePitch(preserve: boolean): void;
  subscribe(listener: (status: EngineStatus) => void): () => void;
  subscribeRemoteNavigation(listener: (command: RemoteTrackCommand) => void): () => void;
  release(): void;
}

// SDK 57 Android maps this to ExoPlayer's maximum forward buffer (seconds).
// Its default maximum is 50 seconds; leave startup/rebuffer thresholds to Expo.
const ANDROID_FORWARD_BUFFER_SECONDS = 120;
const STALL_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];
const RECOVERY_ERROR = '음악 연결이 끊겼습니다. 네트워크를 확인한 뒤 다시 재생해 주세요.';

export class ExpoAudioEngine implements AudioEngine {
  // Expo Go cannot apply this app's expo-audio config plugin to its native binary.
  // executionEnvironment cannot distinguish Expo Go from an expo-dev-client build.
  private readonly backgroundPlaybackAvailable = Constants.appOwnership !== AppOwnership.Expo;
  private lifecycle = 0;
  private operation = 0;
  private source: AudioSource = null;
  private localSource = false;
  private wantsPlayback = false;
  private starting = false;
  private position = 0;
  private duration = 0;
  private retries = 0;
  private stableFrom: number | null = null;
  private failure: string | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private resume: { operation: number; position: number; seeking: boolean } | null = null;
  private hasPlayed = false;
  private bufferingSince: number | null = null;
  private player: AudioPlayer | null = null;
  private playbackRate: number;
  private preservePitch: boolean;
  private configured: Promise<void> | null = null;
  private listeners = new Set<(status: EngineStatus) => void>();
  private subscription: { remove(): void } | null = null;

  private remoteSubscription: { remove(): void } | null = null;
  private remoteListeners = new Set<(command: RemoteTrackCommand) => void>();

  constructor(playbackRate = 1, preservePitch = true) {
    validatePlaybackRate(playbackRate);
    this.playbackRate = playbackRate;
    this.preservePitch = preservePitch;
  }

  setPlaybackRate(rate: number, preservePitch = this.preservePitch): void {
    validatePlaybackRate(rate);
    if (this.player) {
      this.player.shouldCorrectPitch = preservePitch;
      // Web derives preservesPitch from this quality argument, while native
      // platforms use shouldCorrectPitch. Set both to the same preference.
      this.player.setPlaybackRate(rate, preservePitch ? 'high' : undefined);
    }
    this.playbackRate = rate;
    this.preservePitch = preservePitch;
  }

  setPreservePitch(preserve: boolean): void {
    this.setPlaybackRate(this.playbackRate, preserve);
  }

  private applyPlaybackRate(player: AudioPlayer): void {
    // replace() creates a new media element on web. Reapply non-default rates;
    // native iOS also needs the pitch algorithm on the replacement item.
    if (this.playbackRate !== 1 || !this.preservePitch) {
      player.shouldCorrectPitch = this.preservePitch;
      player.setPlaybackRate(this.playbackRate, this.preservePitch ? 'high' : undefined);
    }
  }

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
        this.handleStatus(status);
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

  getPosition(): number {
    // Read the native clock without increasing status updates across the app.
    if (this.resume || this.starting || this.retryTimer !== null) return this.position;
    const position = this.player?.currentTime;
    return typeof position === 'number' && Number.isFinite(position) && position >= 0 ? position : this.position;
  }

  private publish(playing: boolean, buffering: boolean, ended = false): void {
    const status: EngineStatus = { playing, buffering, position: this.position, duration: this.duration, ended, error: this.failure };
    this.listeners.forEach((listener) => listener(status));
  }

  private clearRecoveryTimers(): void {
    if (this.stallTimer !== null) clearTimeout(this.stallTimer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.stallTimer = this.retryTimer = null;
  }

  private watchStall(): void {
    // Android stops periodic status events while buffering. Start a deadline from
    // the transition itself; do not depend on another native event arriving.
    if (!this.wantsPlayback || this.stallTimer !== null || this.retryTimer !== null) return;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      this.scheduleRecovery();
    }, STALL_TIMEOUT_MS);
  }

  private scheduleRecovery(): void {
    if (this.localSource) {
      this.clearRecoveryTimers();
      this.wantsPlayback = this.starting = false;
      this.resume = null;
      this.failure = '로컬 음악을 재생할 수 없습니다. 파일 접근·오디오 포맷을 확인하고 다시 가져와 주세요.';
      this.player?.pause();
      this.publish(false, false);
      return;
    }
    if (!this.wantsPlayback || this.source === null || this.retryTimer !== null) return;
    this.clearRecoveryTimers();
    this.stableFrom = null;
    this.failure = RECOVERY_ERROR;
    if (this.retries >= RETRY_DELAYS_MS.length) {
      this.wantsPlayback = false;
      this.starting = false;
      this.resume = null;
      this.player?.pause();
      this.publish(false, false);
      return;
    }
    const operation = ++this.operation;
    const delay = RETRY_DELAYS_MS[this.retries++];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (operation !== this.operation || !this.wantsPlayback || !this.player) return;
      // replace() prepares a fresh connection. Wait for ready before seeking;
      // seeking an unloaded AVPlayerItem can silently lose the resume position.
      this.resume = { operation, position: this.position, seeking: false };
      this.starting = true;
      this.watchStall();
      try { this.player.pause(); this.player.replace(this.source); this.applyPlaybackRate(this.player); }
      catch { this.resume = null; this.scheduleRecovery(); }
    }, delay);
    this.publish(true, true);
  }

  private async resumePlayback(): Promise<void> {
    const resume = this.resume;
    const player = this.player;
    if (!resume || resume.seeking || !player) return;
    resume.seeking = true;
    try {
      // pause()/replace() can emit the previous item's ready status. Check the
      // current native item after that replacement finishes, before seeking.
      await Promise.resolve();
      if (resume.operation !== this.operation || !this.wantsPlayback) return;
      if (!player.isLoaded) { resume.seeking = false; return; }
      if (resume.position > 0) await player.seekTo(resume.position, 0, 0);
      if (resume.operation !== this.operation || !this.wantsPlayback) return;
      this.resume = null;
      player.play();
    } catch {
      if (resume.operation !== this.operation) return;
      this.resume = null;
      this.scheduleRecovery();
    }
  }

  private handleStatus(status: AudioStatus): void {
    if (status.error) { this.scheduleRecovery(); this.publish(this.wantsPlayback, this.wantsPlayback); return; }
    if (this.resume) {
      if (status.isLoaded) void this.resumePlayback();
      this.publish(this.wantsPlayback, this.wantsPlayback);
      return;
    }
    // Keep the last position and error through idle/loading events after a failure.
    if (this.retryTimer !== null || (this.failure && !this.wantsPlayback)) {
      this.publish(this.wantsPlayback, this.wantsPlayback);
      return;
    }
    if (Number.isFinite(status.duration) && status.duration > 0) this.duration = status.duration;
    if (Number.isFinite(status.currentTime) && (status.isLoaded || status.currentTime > 0) && !(this.failure && this.starting)) this.position = status.currentTime;
    if (status.didJustFinish) {
      this.wantsPlayback = this.starting = false;
      this.clearRecoveryTimers();
      this.publish(false, false, true);
      return;
    }
    if (status.playing && !status.isBuffering) {
      this.wantsPlayback = true; // Includes play from native lock screen controls.
      this.starting = false;
      this.failure = null;
      this.position = status.currentTime;
      this.clearRecoveryTimers();
      // A brief successful resume must not create an unlimited retry loop.
      this.stableFrom ??= this.position;
      if (this.position - this.stableFrom >= 30) this.retries = 0;
    } else if (!this.starting && !status.playing && status.isBuffering && status.timeControlStatus === 'paused') {
      this.wantsPlayback = false;
      this.clearRecoveryTimers();
    } else if (status.isBuffering || this.starting || (!status.isLoaded && this.wantsPlayback)) {
      this.stableFrom = null;
      this.watchStall();
    } else {
      // A native pause/audio-focus interruption is not a broken connection.
      this.wantsPlayback = false;
      this.clearRecoveryTimers();
    }
    this.publish(status.playing || (this.wantsPlayback && this.starting), this.wantsPlayback && (status.isBuffering || this.starting || !status.isLoaded));
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

  async load(source: AudioSource, song: Song, initialPosition = 0): Promise<void> {
    const lifecycle = this.lifecycle;
    const operation = ++this.operation;
    this.clearRecoveryTimers();
    this.resume = null;
    this.wantsPlayback = this.starting = true;
    this.failure = null;
    this.retries = 0;
    this.stableFrom = null;
    this.position = Number.isFinite(initialPosition) ? Math.max(0, initialPosition) : 0;
    this.duration = song.duration;
    const player = await this.setup();
    if (lifecycle !== this.lifecycle || operation !== this.operation) return;
    this.source = source;
    this.localSource = song.source === 'local';
    this.resetBufferingObservation();
    this.watchStall();
    if (this.position > 0) this.resume = { operation, position: this.position, seeking: false };
    player.replace(source);
    this.applyPlaybackRate(player);
    if (this.backgroundPlaybackAvailable) {
      // showSkip* and remoteTrackChange are provided by our pinned expo-audio pnpm patch.
      // Stock showSeek* options only move 10 seconds within the current song.
      player.setActiveForLockScreen(true,
        { title: song.title, artist: song.artist, albumTitle: song.album, artworkUrl: song.artworkUrl },
        Platform.OS === 'android'
          ? { isLiveStream: false, showSkipPrevious: true, showSkipNext: true, showSeekBackward: false, showSeekForward: false }
          : undefined
      );
    }
    if (this.resume) void this.resumePlayback();
    else player.play();
  }
  updateMetadata(song: Song): void {
    if (this.backgroundPlaybackAvailable) this.player?.updateLockScreenMetadata({
      title: song.title, artist: song.artist, albumTitle: song.album, artworkUrl: song.artworkUrl,
    });
  }
  getAudioSessionId(): number | null {
    // Android-only property supplied by our pinned expo-audio patch; absent in older binaries.
    const id = Platform.OS === 'android' ? this.player?.audioSessionId : undefined;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }
  play(): void {
    this.wantsPlayback = true;
    if (this.failure) { this.retries = 0; this.scheduleRecovery(); }
    else { this.starting = true; this.watchStall(); this.player?.play(); }
  }
  pause(): void {
    this.operation++;
    this.wantsPlayback = this.starting = false;
    this.resume = null;
    this.clearRecoveryTimers();
    this.resetBufferingObservation();
    this.player?.pause();
    this.publish(false, false);
  }
  async seek(seconds: number, precise = false): Promise<void> {
    this.resetBufferingObservation();
    this.position = seconds;
    if (this.resume) this.resume.position = seconds;
    else if (!this.failure) {
      if (precise) await this.player?.seekTo(seconds, 0, 0);
      else await this.player?.seekTo(seconds);
    }
  }
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
    this.operation++;
    this.wantsPlayback = this.starting = false;
    this.source = null;
    this.resume = null;
    this.clearRecoveryTimers();
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
