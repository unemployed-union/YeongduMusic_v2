/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'node_modules/expo-audio/ios/MediaController.swift');
const source = fs.readFileSync(target, 'utf8').replace(/^import (MediaPlayer|AVFoundation|ExpoModulesCore)\n/gm, '');
assert(source.includes('class MediaController'), 'Exercise the installed production controller');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yeongdu-now-playing-artwork-'));
// Compile the complete production Swift controller against deterministic system
// boundaries. This checks its real state/callback logic, not UIKit rendering.
const boundaries = String.raw`
import Foundation
import Darwin
let MPMediaItemPropertyArtwork = "artwork", MPMediaItemPropertyPlaybackDuration = "duration"
let MPNowPlayingInfoPropertyElapsedPlaybackTime = "elapsed", MPNowPlayingInfoPropertyPlaybackRate = "rate"
let MPNowPlayingInfoPropertyIsLiveStream = "live", MPNowPlayingInfoPropertyMediaType = "type"
let MPMediaItemPropertyTitle = "title", MPMediaItemPropertyArtist = "artist", MPMediaItemPropertyAlbumTitle = "album"
enum MPNowPlayingInfoMediaType: Int { case audio = 1 }
class MPNowPlayingInfoCenter {
  static let shared = MPNowPlayingInfoCenter()
  static func \`default\`() -> MPNowPlayingInfoCenter { shared }
  var nowPlayingInfo: [String: Any]?
}
class UIImage {
  let name: String
  let size = CGSize(width: 16, height: 16)
  init?(data: Data) { guard let name = String(data: data, encoding: .utf8), !name.isEmpty else { return nil }; self.name = name }
}
class MPMediaItemArtwork {
  let image: UIImage
  init(boundsSize: CGSize, requestHandler: (CGSize) -> UIImage) { image = requestHandler(boundsSize) }
}
struct CMTime {
  var seconds: Double
  init(seconds: Double, preferredTimescale: Int32) { self.seconds = seconds }
  static let zero = CMTime(seconds: 0, preferredTimescale: 1)
  static func +(lhs: CMTime, rhs: CMTime) -> CMTime { CMTime(seconds: lhs.seconds + rhs.seconds, preferredTimescale: 1) }
  static func -(lhs: CMTime, rhs: CMTime) -> CMTime { CMTime(seconds: lhs.seconds - rhs.seconds, preferredTimescale: 1) }
}
enum CommonKey { case commonKeyTitle, commonKeyArtist, commonKeyAlbumName, commonKeyArtwork }
struct AssetMetadata { var commonKey: CommonKey?; var stringValue: String?; var dataValue: Data? }
class AVURLAsset { var commonMetadata: [AssetMetadata] = [] }
class PlayerItem { var asset: Any = AVURLAsset() }
class PlayerReference {
  var currentItem: PlayerItem? = PlayerItem()
  var rate: Float = 1
  func pause() { rate = 0 }
  func currentTime() -> CMTime { .zero }
  func seek(to: CMTime) {}
  func seek(to: CMTime, toleranceBefore: CMTime, toleranceAfter: CMTime) {}
}
struct Metadata { var title: String?; var artist: String?; var albumTitle: String?; var artworkUrl: URL? }
struct LockScreenOptions { var isLiveStream: Bool? = false; var showSeekForward = false; var showSeekBackward = false }
class AudioPlayer {
  let id = UUID().uuidString
  var ref = PlayerReference(), metadata: Metadata?
  var isActiveForLockScreen = false, isLive = false, isPlaying = true
  var duration: Double = 180, currentTime: Double = 10, currentRate: Double = 1
  func play(at: Float) { ref.rate = at }
}
enum MPRemoteCommandHandlerStatus { case success, commandFailed }
class MPRemoteCommandEvent {}
class MPChangePlaybackPositionCommandEvent: MPRemoteCommandEvent { var positionTime: Double = 0 }
class MPSkipIntervalCommandEvent: MPRemoteCommandEvent { var interval: Double = 10 }
class RemoteCommand {
  var isEnabled = false, preferredIntervals: [Double] = []
  func addTarget(_ handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus) {}
  func removeTarget(_ target: Any?) {}
}
class MPRemoteCommandCenter {
  static let instance = MPRemoteCommandCenter()
  static func shared() -> MPRemoteCommandCenter { instance }
  let playCommand = RemoteCommand(), pauseCommand = RemoteCommand(), togglePlayPauseCommand = RemoteCommand()
  let changePlaybackPositionCommand = RemoteCommand(), skipForwardCommand = RemoteCommand(), skipBackwardCommand = RemoteCommand()
}
class URLSession {
  static let shared = URLSession()
  struct Request { var url: URL; var complete: (Data?, Any?, Error?) -> Void }
  var requests: [Request] = []
  class Task { var start: () -> Void; init(_ start: @escaping () -> Void) { self.start = start }; func resume() { start() } }
  func dataTask(with url: URL, completionHandler: @escaping (Data?, Any?, Error?) -> Void) -> Task {
    Task { self.requests.append(Request(url: url, complete: completionHandler)) }
  }
}
`;
const scenarios = String.raw`
var failures = 0
func check(_ value: @autoclosure () -> Bool, _ label: String) { if !value() { failures += 1; print("FAIL: \(label)") } }
func artwork() -> String? { (MPNowPlayingInfoCenter.shared.nowPlayingInfo?[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork)?.image.name }
func metadata(_ title: String, _ image: String?) -> Metadata {
  Metadata(title: title, artist: "Fixture artist", albumTitle: "Fixture album", artworkUrl: image.map { URL(string: "https://fixture.invalid/\($0)")! })
}
func complete(_ image: String?) {
  check(!URLSession.shared.requests.isEmpty, "Artwork request exists")
  guard !URLSession.shared.requests.isEmpty else { return }
  let request = URLSession.shared.requests.removeFirst()
  request.complete(image.map { Data($0.utf8) }, nil, nil)
}
let center = MediaController.shared, player = AudioPlayer()
player.metadata = metadata("A", "cover-A")
center.setActivePlayer(player); complete("A")
check(artwork() == "A", "First song displays its artwork")
let cachedRequests = URLSession.shared.requests.count
center.updateNowPlayingInfo(for: player)
check(artwork() == "A" && URLSession.shared.requests.count == cachedRequests, "Same song keeps its cached artwork")

// NAS supplies a cover endpoint even for songs whose endpoint returns no image.
player.ref.currentItem = PlayerItem(); player.metadata = metadata("B without cover", "missing-B")
center.updateNowPlayingInfo(for: player)
check(artwork() == nil, "Track transition clears the previous image before a NAS cover loads")
complete(nil)
check(artwork() == nil, "A missing or failed NAS image cannot retain the previous cover")
check(MPNowPlayingInfoCenter.shared.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "B without cover", "Track labels remain updated")
check(MPNowPlayingInfoCenter.shared.nowPlayingInfo?[MPMediaItemPropertyPlaybackDuration] as? Double == 180, "Artwork clearing retains playback duration")

player.ref.currentItem = PlayerItem(); player.metadata = metadata("C", "pending-C")
center.updateNowPlayingInfo(for: player)
player.ref.currentItem = PlayerItem(); player.metadata = metadata("D no URL", nil)
center.updateNowPlayingInfo(for: player); complete("C")
check(artwork() == nil, "Late artwork cannot reappear after switching to a song with no URL")

player.metadata = metadata("E", "E"); center.updateNowPlayingInfo(for: player); complete("E")
check(artwork() == "E", "A later valid cover still loads")
player.metadata = metadata("E edited", "E-new-missing"); center.updateNowPlayingInfo(for: player)
check(artwork() == nil, "Changing artwork within the same AVPlayerItem clears the old image")
complete(nil); check(artwork() == nil, "An edited image failure does not restore its predecessor")

player.metadata = metadata("F pending", "F"); center.updateNowPlayingInfo(for: player)
player.ref.currentItem = PlayerItem() // The native item can change before the next status update.
complete("F")
check(artwork() == nil, "Completion checks the actual current AVPlayerItem")
player.metadata = metadata("G pending", "G"); center.updateNowPlayingInfo(for: player)
player.metadata = metadata("H no URL", nil) // Metadata can change before the main-queue info refresh.
complete("G")
check(artwork() == nil, "Completion checks current metadata, not only cached request state")
center.updateNowPlayingInfo(for: player)

player.metadata = metadata("I pending", "I"); center.updateNowPlayingInfo(for: player)
let replacement = AudioPlayer(); replacement.metadata = metadata("J no URL", nil)
center.setActivePlayer(replacement); complete("I")
check(artwork() == nil && !player.isActiveForLockScreen, "Switching players invalidates old requests")
replacement.metadata = metadata("K pending", "K"); center.updateNowPlayingInfo(for: replacement)
center.setActivePlayer(nil); complete("K")
check(MPNowPlayingInfoCenter.shared.nowPlayingInfo == nil, "Releasing the media session cannot resurrect artwork")
if failures == 0 { print("PASS: production iOS MediaController artwork clearing, pending/failing cover URLs, cached covers, metadata/item/player races and released sessions; playback labels/duration retained. System UI is mocked.") }
exit(failures == 0 ? 0 : 1)
`;
const swift = path.join(directory, 'main.swift'), executable = path.join(directory, 'check-artwork');
fs.writeFileSync(swift, boundaries.replaceAll('\\`', '`') + '\n' + source + '\n' + scenarios);
const compilation = spawnSync('xcrun', ['swiftc', '-swift-version', '5', '-module-cache-path', path.join(directory, 'module-cache'), swift, '-o', executable], { encoding: 'utf8' });
if (compilation.status !== 0) { process.stderr.write(compilation.stderr || compilation.error?.message || 'Swift compiler unavailable'); process.exit(compilation.status || 1); }
const result = spawnSync(executable, [], { encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
