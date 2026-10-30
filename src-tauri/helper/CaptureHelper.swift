// SmartConf Claw capture helper (macOS).
//
// Compiled by build.rs with `swiftc` and embedded into the app binary; extracted at runtime.
// Commands:
//   probe               → JSON { systemAudio, screenRecording, osVersion }
//   list-windows        → JSON array of normal app windows (id/app/title/bounds) for window capture
//   request-permission  → triggers the Screen Recording permission prompt, JSON { granted }
//   screenshot --window-id N --out PATH
//                       → PNG of one window via ScreenCaptureKit (macOS 14+), even when covered;
//                         exit code 4 when unsupported so the caller falls back to `screencapture -l`
//   system-audio [--sample-rate N]
//                       → streams system playback audio as raw f32le mono PCM on stdout
//                         (ScreenCaptureKit, macOS 13+). No virtual audio driver (BlackHole) needed.

import AppKit
import CoreAudio
import CoreGraphics
import CoreMedia
import Foundation
import ImageIO
import ScreenCaptureKit

func emitJSON(_ object: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []) else {
        return
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func logLine(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    logLine(message)
    exit(code)
}

func probe() {
    var systemAudio = false
    if #available(macOS 13.0, *) {
        systemAudio = true
    }
    emitJSON([
        "systemAudio": systemAudio,
        "screenRecording": CGPreflightScreenCaptureAccess(),
        "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
    ])
}

func listWindows() {
    let options: CGWindowListOption = [.optionAll, .excludeDesktopElements]
    guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        emitJSON([Any]())
        return
    }
    let ownPids: Set<Int32> = [ProcessInfo.processInfo.processIdentifier, getppid()]
    var result: [[String: Any]] = []
    for info in raw {
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        if layer != 0 {
            continue
        }
        guard let number = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value else {
            continue
        }
        let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
        if ownPids.contains(pid) {
            continue
        }
        var rect = CGRect.zero
        if let bounds = info[kCGWindowBounds as String] as? NSDictionary,
           let parsed = CGRect(dictionaryRepresentation: bounds as CFDictionary)
        {
            rect = parsed
        }
        if rect.width < 160 || rect.height < 120 {
            continue
        }
        // Browsers keep fully transparent helper windows around; they cannot be captured.
        let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
        if alpha < 0.05 {
            continue
        }
        let owner = info[kCGWindowOwnerName as String] as? String ?? ""
        let title = info[kCGWindowName as String] as? String ?? ""
        let onScreen = (info[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue ?? false
        let bundleId = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier ?? ""
        result.append([
            "id": number,
            "pid": pid,
            "app": owner,
            "bundleId": bundleId,
            "title": title,
            "x": rect.origin.x,
            "y": rect.origin.y,
            "width": rect.width,
            "height": rect.height,
            "onScreen": onScreen,
        ])
    }
    emitJSON(result)
}

@available(macOS 14.0, *)
func captureWindowScreenshot(windowID: UInt32, outPath: String) async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let window = content.windows.first(where: { $0.windowID == windowID }) else {
        throw NSError(domain: "SmartConfCapture", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "window \(windowID) not found (closed?)",
        ])
    }
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let config = SCStreamConfiguration()
    // Retina windows are captured at up to 2× points; plenty for slide text.
    let scale = CGFloat(min(filter.pointPixelScale, 2))
    config.width = max(Int(window.frame.width * scale), 2)
    config.height = max(Int(window.frame.height * scale), 2)
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = true
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

    let url = URL(fileURLWithPath: outPath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else {
        throw NSError(domain: "SmartConfCapture", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "cannot write \(outPath)",
        ])
    }
    CGImageDestinationAddImage(destination, image, nil)
    if !CGImageDestinationFinalize(destination) {
        throw NSError(domain: "SmartConfCapture", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "failed to encode PNG",
        ])
    }
}

/// Captures everything the Mac plays (meeting app, browser tab, …) and writes it to stdout as a
/// continuous real-time f32le mono stream. Gaps (silence with no buffers delivered) are filled with
/// zeros so the stream clock always matches wall time and stays in sync with microphone inputs.
@available(macOS 13.0, *)
final class SystemAudioTap: NSObject, SCStreamOutput, SCStreamDelegate {
    private let sampleRate: Int
    private let lock = NSLock()
    private var pending: [Float] = []
    private var stream: SCStream?
    private let sampleQueue = DispatchQueue(label: "smartconf.audio.samples")
    private let pumpQueue = DispatchQueue(label: "smartconf.audio.pump")
    private var pumpTimer: DispatchSourceTimer?
    private var startUptime: UInt64 = 0
    private var framesWritten = 0
    /// Small jitter buffer so ScreenCaptureKit delivery bursts do not turn into zero padding.
    private let cushionSec = 0.2

    init(sampleRate: Int) {
        self.sampleRate = sampleRate
        super.init()
    }

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "SmartConfCapture", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "no display available for ScreenCaptureKit",
            ])
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = sampleRate
        config.channelCount = 1
        // ScreenCaptureKit always runs a video stream; keep it tiny and slow.
        config.width = 64
        config.height = 64
        config.minimumFrameInterval = CMTime(value: 1, timescale: 2)

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()
        self.stream = stream
        startPump()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, CMSampleBufferIsValid(sampleBuffer) else {
            return
        }
        guard let samples = SystemAudioTap.monoSamples(from: sampleBuffer), !samples.isEmpty else {
            return
        }
        lock.lock()
        pending.append(contentsOf: samples)
        if pending.count > sampleRate {
            pending.removeFirst(pending.count - sampleRate / 2)
        }
        lock.unlock()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fail("system audio stream stopped: \(error.localizedDescription)", code: 3)
    }

    private func startPump() {
        startUptime = DispatchTime.now().uptimeNanoseconds
        let timer = DispatchSource.makeTimerSource(queue: pumpQueue)
        timer.schedule(deadline: .now() + .milliseconds(20), repeating: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            self?.pump()
        }
        timer.resume()
        pumpTimer = timer
    }

    private func pump() {
        let elapsed = Double(DispatchTime.now().uptimeNanoseconds - startUptime) / 1_000_000_000 - cushionSec
        if elapsed <= 0 {
            return
        }
        let target = Int(elapsed * Double(sampleRate))
        let need = target - framesWritten
        if need <= 0 {
            return
        }
        if need > sampleRate / 2 {
            // The process was suspended (capture paused via SIGSTOP): skip the gap instead of
            // writing seconds of silence, so the stream stays aligned with the other inputs.
            lock.lock()
            pending.removeAll(keepingCapacity: true)
            lock.unlock()
            framesWritten = target
            return
        }
        var chunk = [Float](repeating: 0, count: need)
        lock.lock()
        let take = min(need, pending.count)
        if take > 0 {
            chunk.replaceSubrange(0..<take, with: pending[0..<take])
            pending.removeFirst(take)
        }
        lock.unlock()
        framesWritten += need
        let data = chunk.withUnsafeBufferPointer { Data(buffer: $0) }
        FileHandle.standardOutput.write(data)
    }

    static func monoSamples(from sampleBuffer: CMSampleBuffer) -> [Float]? {
        guard let format = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(format),
              let block = CMSampleBufferGetDataBuffer(sampleBuffer)
        else {
            return nil
        }
        let asbd = asbdPointer.pointee
        let length = CMBlockBufferGetDataLength(block)
        if length == 0 {
            return []
        }
        var bytes = [UInt8](repeating: 0, count: length)
        let status = bytes.withUnsafeMutableBytes { buffer in
            CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: buffer.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else {
            return nil
        }

        let channels = max(Int(asbd.mChannelsPerFrame), 1)
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let nonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        let bytesPerSample = Int(asbd.mBitsPerChannel / 8)
        guard bytesPerSample == 2 || bytesPerSample == 4 else {
            return nil
        }
        let total = length / bytesPerSample
        var samples = [Float](repeating: 0, count: total)
        bytes.withUnsafeBytes { raw in
            if bytesPerSample == 4 && isFloat {
                let values = raw.bindMemory(to: Float.self)
                for i in 0..<total { samples[i] = values[i] }
            } else if bytesPerSample == 4 {
                let values = raw.bindMemory(to: Int32.self)
                for i in 0..<total { samples[i] = Float(values[i]) / 2_147_483_648 }
            } else {
                let values = raw.bindMemory(to: Int16.self)
                for i in 0..<total { samples[i] = Float(values[i]) / 32768 }
            }
        }
        if channels == 1 {
            return samples
        }
        let frames = total / channels
        var mono = [Float](repeating: 0, count: frames)
        for frame in 0..<frames {
            var sum: Float = 0
            for channel in 0..<channels {
                sum += nonInterleaved ? samples[channel * frames + frame] : samples[frame * channels + channel]
            }
            mono[frame] = sum / Float(channels)
        }
        return mono
    }
}

var keepAlive: AnyObject?

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    fail("usage: scc-helper <probe|list-windows|request-permission|system-audio>")
}

// A plain command-line process has no window-server connection; ScreenCaptureKit then aborts with
// "Assertion failed: (did_initialize), function CGS_REQUIRE_INIT". Creating the shared
// NSApplication sets that connection up. `.prohibited` keeps the helper out of the Dock.
NSApplication.shared.setActivationPolicy(.prohibited)

switch arguments[1] {
case "probe":
    probe()
case "list-windows":
    listWindows()
case "screenshot":
    guard #available(macOS 14.0, *) else {
        fail("ScreenCaptureKit screenshots need macOS 14 or later.", code: 4)
    }
    func value(_ flag: String) -> String? {
        guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
            return nil
        }
        return arguments[index + 1]
    }
    guard let idText = value("--window-id"), let windowID = UInt32(idText), let outPath = value("--out") else {
        fail("usage: scc-helper screenshot --window-id N --out PATH")
    }
    Task {
        do {
            try await captureWindowScreenshot(windowID: windowID, outPath: outPath)
            exit(0)
        } catch {
            fail("Window screenshot failed: \(error.localizedDescription)", code: 2)
        }
    }
    dispatchMain()
case "request-permission":
    emitJSON(["granted": CGRequestScreenCaptureAccess()])
case "system-audio":
    guard #available(macOS 13.0, *) else {
        fail("System audio capture needs macOS 13 (Ventura) or later.", code: 2)
    }
    var sampleRate = 48000
    if let index = arguments.firstIndex(of: "--sample-rate"), index + 1 < arguments.count,
       let value = Int(arguments[index + 1]), value >= 8000, value <= 48000
    {
        sampleRate = value
    }
    signal(SIGTERM) { _ in exit(0) }
    signal(SIGINT) { _ in exit(0) }
    let tap = SystemAudioTap(sampleRate: sampleRate)
    keepAlive = tap
    Task {
        do {
            try await tap.start()
            logLine("system audio capture started (\(sampleRate) Hz mono f32le)")
        } catch {
            fail("Failed to start system audio capture: \(error.localizedDescription). "
                + "Grant Screen Recording permission in System Settings › Privacy & Security.", code: 2)
        }
    }
    dispatchMain()
default:
    fail("unknown command: \(arguments[1])")
}
