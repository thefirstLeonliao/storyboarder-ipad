import Foundation
import Capacitor
import UniformTypeIdentifiers
import AVFoundation
import PDFKit
import UIKit

/// Storyboarder for iPad — custom Capacitor plugin (spec §6).
///
/// Single native entry point for all system capabilities:
///   - file i/o (FileManager)
///   - iCloud / UIDocumentPicker
///   - share sheet (UIActivityViewController)
///   - PDF export (UIGraphicsPDFRenderer)
///   - video / animatic export (AVFoundation, AVAssetWriter)
///   - native alerts
///
/// RULE (spec §40 Rule 5): NO Storyboard business logic here. Only system bridges.
/// The web runtime (WKWebView) builds project state, boards, ink, metadata and
/// calls these methods with already-serialized payloads (base64 blobs, paths).
@objc(StoryboarderNativePlugin)
public class StoryboarderNativePlugin: CAPPlugin {

    // MARK: - Paths

    /// App sandbox "Documents" directory — persistent, user-visible in Files app.
    @objc func getDocumentsDir(_ call: CAPPluginCall) {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .path ?? NSTemporaryDirectory()
        call.resolve(["path": dir])
    }

    /// App sandbox "Library/Application Support" directory — private app data.
    @objc func getLibraryDir(_ call: CAPPluginCall) {
        let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?
            .path ?? NSTemporaryDirectory()
        call.resolve(["path": dir])
    }

    // MARK: - File Service (spec §5, §15)

    /// Present a UIDocumentPickerViewController and return chosen file URLs.
    @objc func pickDocument(_ call: CAPPluginCall) {
        let types = call.getArray("types", String.self) ?? ["public.item"]
        let utTypes = types.compactMap { UTType($0) }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: utTypes.isEmpty ? [.item] : utTypes)
            picker.delegate = DocumentPickerDelegate { urls in
                call.resolve(["filePaths": urls.map { $0.path }])
            }
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    /// Present a UIDocumentPickerViewController for *saving* a file the app produced.
    /// `dataBase64` is written to a temp file first, then the save sheet is shown.
    @objc func saveToFiles(_ call: CAPPluginCall) {
        guard let b64 = call.getString("dataBase64"),
              let data = Data(base64Encoded: b64),
              let name = call.getString("fileName") else {
            call.reject("invalid saveToFiles args")
            return
        }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try data.write(to: tmp, options: .atomic)
        } catch {
            call.reject("cannot stage file: \(error.localizedDescription)")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let picker = UIDocumentPickerViewController(forExporting: [tmp], asCopy: true)
            picker.delegate = DocumentPickerDelegate { _ in
                call.resolve(["ok": true, "path": tmp.path])
            }
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    /// Read a file (sandbox path or security-scoped bookmark) as base64.
    @objc func readFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("missing path")
            return
        }
        var staged = path
        // If the path is a security-scoped bookmark string, resolve it.
        if let bookmark = Data(base64Encoded: path),
           let url = try? URL(resolvingBookmarkData: bookmark,
                              options: .withSecurityScope,
                              relativeTo: nil,
                              bookmarkDataIsStale: nil),
           url.startAccessingSecurityScopedResource() {
            staged = url.path
            defer { url.stopAccessingSecurityScopedResource() }
        }
        guard let data = FileManager.default.contents(atPath: staged) else {
            call.reject("cannot read \(staged)")
            return
        }
        call.resolve(["dataBase64": data.base64EncodedString(), "path": staged])
    }

    /// Write a base64 payload to a sandbox path.
    @objc func writeFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let b64 = call.getString("dataBase64"),
              let data = Data(base64Encoded: b64) else {
            call.reject("invalid write args")
            return
        }
        do {
            try FileManager.default.createDirectory(at: URL(fileURLWithPath: path).deletingLastPathComponent(),
                                                    withIntermediateDirectories: true)
            try data.write(to: URL(fileURLWithPath: path), options: .atomic)
            call.resolve(["ok": true, "path": path])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // MARK: - Dialog Service (spec §5)

    @objc func alert(_ call: CAPPluginCall) {
        let message = call.getString("message") ?? ""
        let title = call.getString("title") ?? "Storyboarder"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let ac = UIAlertController(title: title, message: message, preferredStyle: .alert)
            ac.addAction(UIAlertAction(title: "OK", style: .default))
            self.bridge?.viewController?.present(ac, animated: true)
        }
        call.resolve()
    }

    @objc func confirm(_ call: CAPPluginCall) {
        let message = call.getString("message") ?? ""
        let title = call.getString("title") ?? "Storyboarder"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let ac = UIAlertController(title: title, message: message, preferredStyle: .alert)
            ac.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in call.resolve(["confirmed": false]) })
            ac.addAction(UIAlertAction(title: "OK", style: .default) { _ in call.resolve(["confirmed": true]) })
            self.bridge?.viewController?.present(ac, animated: true)
        }
    }

    // MARK: - Share Service (spec §26)

    @objc func shareSheet(_ call: CAPPluginCall) {
        guard let items = call.getArray("items", String.self) else { call.reject("no items"); return }
        let urls = items.compactMap { URL(fileURLWithPath: $0) }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let vc = UIActivityViewController(activityItems: urls, applicationActivities: nil)
            if let pop = vc.popoverPresentationController {
                pop.sourceView = self.bridge?.viewController?.view
            }
            self.bridge?.viewController?.present(vc, animated: true)
        }
        call.resolve()
    }

    // MARK: - Media Service (spec §21 / §22)

    /// Build a PDF from an array of pages. Each page:
    ///   { "jpegBase64": String, "lines": [String] }
    /// Native assembly via UIGraphicsPDFRenderer (PDFKit not required for raster).
    @objc func exportPDF(_ call: CAPPluginCall) {
        guard let pages = call.getArray("pages") as? [[String: Any]] else {
            call.reject("exportPDF: missing 'pages'")
            return
        }
        let pageRect = CGRect(x: 0, y: 0, width: 595.28, height: 841.89) // A4 @ 72dpi
        let pdfDir = FileManager.default.temporaryDirectory
        let outURL = pdfDir.appendingPathComponent("storyboarder-\(UUID().uuidString).pdf")
        if #available(iOS 10.0, *) {
            guard let renderer = UIGraphicsPDFRenderer(bounds: pageRect,
                    format: UIGraphicsPDFRendererFormat()) as? UIGraphicsPDFRenderer else {
                call.reject("exportPDF: renderer unavailable")
                return
            }
            do {
                try renderer.writePDF(to: outURL) { ctx in
                    for page in pages {
                        ctx.beginPage()
                        if let b64 = page["jpegBase64"] as? String,
                           let data = Data(base64Encoded: b64),
                           let img = UIImage(data: data) {
                            let maxW = pageRect.width - 48
                            let maxH = pageRect.height - 160
                            let ratio = min(maxW / img.size.width, maxH / img.size.height)
                            let w = img.size.width * ratio
                            let h = img.size.height * ratio
                            let r = CGRect(x: (pageRect.width - w) / 2, y: 24, width: w, height: h)
                            img.draw(in: r)
                        }
                        if let lines = page["lines"] as? [String] {
                            let text = lines.joined(separator: "\n")
                            let para = NSMutableParagraphStyle()
                            para.lineBreakMode = .byWordWrapping
                            (text as NSString).draw(in: CGRect(x: 24, y: pageRect.height - 120,
                                                                   width: pageRect.width - 48, height: 100),
                                                    withAttributes: [
                                                        .font: UIFont.systemFont(ofSize: 11),
                                                        .paragraphStyle: para
                                                    ])
                        }
                    }
                }
                call.resolve(["path": outURL.path])
            } catch {
                call.reject("exportPDF failed: \(error.localizedDescription)")
            }
        } else {
            call.reject("exportPDF requires iOS 10+")
        }
    }

    /// Encode an array of JPEG frames -> H.264/HEVC MP4/MOV via AVFoundation.
    /// Payload: { "frames": [base64...], "fps": Int, "format": "mp4"|"mov",
    ///            "width": Int, "height": Int }
    @objc func exportAnimatic(_ call: CAPPluginCall) {
        guard let frames = call.getArray("frames") as? [String],
              let fps = call.getInt("fps"),
              let w = call.getInt("width"),
              let h = call.getInt("height") else {
            call.reject("exportAnimatic: missing frames/fps/width/height")
            return
        }
        let ext = (call.getString("format") ?? "mp4") == "mov" ? "mov" : "mp4"
        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("animatic-\(UUID().uuidString).\(ext)")
        let fileType: AVFileType = ext == "mov" ? .mov : .mp4

        let group = DispatchGroup()
        group.enter()
        var exportError: String?

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let writer = try AVAssetWriter(outputURL: outURL, fileType: fileType)
                let settings: [String: Any] = [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: w,
                    AVVideoHeightKey: h
                ]
                let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
                input.expectsMediaDataInRealTime = false
                let adapter = AVAssetWriterInputPixelBufferAdaptor(
                    assetWriterInput: input,
                    sourcePixelBufferAttributes: [
                        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB
                    ])
                writer.add(input)
                writer.startWriting()
                writer.startSession(atSourceTime: .zero)

                let frameDur = CMTime(value: 1, timescale: CMTimeScale(fps))
                var present = CMTime.zero
                for (i, b64) in frames.enumerated() {
                    guard let data = Data(base64Encoded: b64),
                          let img = UIImage(data: data),
                          let pb = Self.pixelBuffer(from: img, size: CGSize(width: w, height: h)) else {
                        exportError = "exportAnimatic: bad frame \(i)"
                        break
                    }
                    while !adapter.assetWriterInput.isReadyForMoreMediaData { usleep(5000) }
                    adapter.append(pb, withPresentationTime: present)
                    present = CMTimeAdd(present, frameDur)
                }
                input.markAsFinished()
                writer.finishWriting {
                    if writer.status == .failed {
                        exportError = writer.error?.localizedDescription ?? "unknown writer failure"
                    }
                    group.leave()
                }
            } catch {
                exportError = error.localizedDescription
                group.leave()
            }
        }

        group.notify(queue: .main) {
            if let err = exportError {
                call.reject("exportAnimatic: \(err)")
            } else {
                call.resolve(["path": outURL.path])
            }
        }
    }

    // MARK: - helpers

    /// Draw a UIImage into a fresh ARGB CVPixelBuffer of the given size.
    static func pixelBuffer(from image: UIImage, size: CGSize) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault, Int(size.width), Int(size.height),
                                  kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pb) == kCVReturnSuccess,
              let buffer = pb else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer),
                                  width: Int(size.width), height: Int(size.height),
                                  bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue) else { return nil }
        if let cg = image.cgImage {
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: size.width, height: size.height))
        }
        return buffer
    }
}

/// Minimal UIDocumentPickerDelegate bridge (no retain cycle via capture).
private class DocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
    let onPick: ([URL]) -> Void
    init(onPick: @escaping ([URL]) -> Void) { self.onPick = onPick }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        onPick(urls)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        onPick([])
    }
}
