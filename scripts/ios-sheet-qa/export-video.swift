import Foundation
import AVFoundation

// Trim a real simctl recording; never synthesize frames or animation.
@main struct ExportSheetVideo {
  static func main() async throws {
    guard CommandLine.arguments.count == 5,
      let start = Double(CommandLine.arguments[3]),
      let duration = Double(CommandLine.arguments[4]) else {
      fatalError("Usage: export-video INPUT OUTPUT START_SECONDS DURATION_SECONDS")
    }
    let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
    guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality) else {
      fatalError("Video export is unavailable")
    }
    exporter.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600),
                                    duration: CMTime(seconds: duration, preferredTimescale: 600))
    try await exporter.export(to: URL(fileURLWithPath: CommandLine.arguments[2]), as: .mp4)
    print("Exported actual recording: \(CommandLine.arguments[2])")
  }
}
