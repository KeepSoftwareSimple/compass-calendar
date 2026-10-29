import AppKit
import CompassData
import CompassKit
import CoreGraphics

/// Renders the main window content at the canonical parity viewport (1280×820 px).
enum ParityViewSnapshotExporter {
    static let titleBarReferenceFileName = "mac-title-bar-full-window.png"

    private static let pixelWidth = Int(ParityCaptureGeometry.viewportWidth)
    private static let pixelHeight = Int(ParityCaptureGeometry.viewportHeight)

    @MainActor
    static func export(surface: String, from window: NSWindow?) throws {
        guard UITestLaunchPolicy.isParityCapture else { return }
        guard ParityCaptureSurface.isValid(surface) else { return }
        guard let window, let contentView = window.contentView else { return }
        guard let directory = parityOutputDirectory else { return }

        ParityCaptureWindowPolicy.applyIfNeeded(to: window)
        window.displayIfNeeded()
        contentView.layoutSubtreeIfNeeded()
        contentView.wantsLayer = true
        contentView.layer?.displayIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))

        let contentSize = NSSize(
            width: ParityCaptureGeometry.viewportWidth,
            height: ParityCaptureGeometry.viewportHeight
        )
        let laidOut = window.contentRect(forFrameRect: window.frame)
        if abs(laidOut.width - contentSize.width) > 2 || abs(laidOut.height - contentSize.height) > 2 {
            ParityCaptureWindowPolicy.applyIfNeeded(to: window)
            window.displayIfNeeded()
        }

        let folder = URL(fileURLWithPath: directory, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Keep the window-server result independent of cacheDisplay's layer changes.
        // Comparing the two exposes export artifacts before we change product rendering.
        if let windowPNG = windowListPNG(window: window, includingPopovers: true) {
            try windowPNG.write(to: folder.appendingPathComponent("\(surface)-window-reference.png"))
        }

        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelWidth,
            pixelsHigh: pixelHeight,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else { return }

        bitmap.size = contentSize
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return }
        NSGraphicsContext.current = context
        let captureRect = NSRect(origin: .zero, size: contentSize)
        context.cgContext.clear(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
        enableLayerBackedDrawing(contentView)
        contentView.cacheDisplay(in: captureRect, to: bitmap)
        NSGraphicsContext.current = context
        drawPopoverWindows(over: window)

        let file = folder.appendingPathComponent("\(surface).png")

        let pngData = bitmap.representation(using: .png, properties: [:])
        if let pngData, pngData.count < 30_000, let windowPNG = windowListPNG(window: window) {
            try windowPNG.write(to: file)
            NativeAccessibilityProbes.publishParityExport(surface: surface, on: window)
            return
        }

        guard let png = pngData else { return }
        try png.write(to: file)
        NativeAccessibilityProbes.publishParityExport(surface: surface, on: window)
    }

    /// Popovers (the form's date picker and time list) are separate windows,
    /// so `cacheDisplay` of the content view leaves them out and the capture
    /// showed a closed field. Draw each visible one on top at its offset from
    /// the main window's content, as it appears on screen.
    @MainActor
    private static func drawPopoverWindows(over window: NSWindow) {
        let content = window.contentRect(forFrameRect: window.frame)
        let popovers = (window.childWindows ?? []) + NSApp.windows.filter {
            String(describing: type(of: $0)).contains("Popover")
        }
        var drawn = Set<ObjectIdentifier>()
        for popover in popovers where popover !== window && popover.isVisible {
            guard drawn.insert(ObjectIdentifier(popover)).inserted,
                popover.frame.intersects(window.frame),
                let view = popover.contentView,
                let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)
            else { continue }
            view.cacheDisplay(in: view.bounds, to: rep)
            let frame = popover.contentRect(forFrameRect: popover.frame)
            rep.draw(in: NSRect(
                x: frame.minX - content.minX,
                y: frame.minY - content.minY,
                width: frame.width,
                height: frame.height))
        }
    }

    /// Full window PNG including traffic lights for marketing title-bar crop (CI).
    @MainActor
    static func exportTitleBarReference(from window: NSWindow?) throws {
        guard UITestLaunchPolicy.isParityCapture else { return }
        guard let window, let directory = parityOutputDirectory else { return }
        applyCaptureWindowSize(to: window)
        guard let png = windowListPNG(window: window) else { return }
        let file = URL(fileURLWithPath: directory, isDirectory: true)
            .appendingPathComponent(titleBarReferenceFileName)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try png.write(to: file)
    }

    /// Ensures the on-screen window matches parity dimensions before XCUITest screenshots.
    @MainActor
    static func applyCaptureWindowSize(to window: NSWindow?) {
        guard UITestLaunchPolicy.isParityCapture else { return }
        ParityCaptureWindowPolicy.applyIfNeeded(to: window)
        window?.orderFrontRegardless()
        window?.makeKeyAndOrderFront(nil)
        window?.displayIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        guard let window, let directory = parityOutputDirectory else { return }
        let windowNumber = window.windowNumber
        guard windowNumber != 0 else { return }
        let file = URL(fileURLWithPath: directory, isDirectory: true)
            .appendingPathComponent("parity-window-id.txt")
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? String(windowNumber).write(to: file, atomically: true, encoding: .utf8)
    }

    private static func enableLayerBackedDrawing(_ view: NSView) {
        view.wantsLayer = true
        for subview in view.subviews {
            enableLayerBackedDrawing(subview)
        }
    }

    private static func windowListPNG(window: NSWindow, includingPopovers: Bool = false) -> Data? {
        window.orderFrontRegardless()
        window.displayIfNeeded()
        let windowID = CGWindowID(window.windowNumber)
        guard windowID != 0 else { return nil }
        guard let cgImage = CGWindowListCreateImage(
            .null, .optionIncludingWindow, windowID, [.boundsIgnoreFraming, .bestResolution]
        ) else { return nil }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        rep.size = NSSize(width: ParityCaptureGeometry.viewportWidth, height: ParityCaptureGeometry.viewportHeight)
        if includingPopovers, let context = NSGraphicsContext(bitmapImageRep: rep) {
            NSGraphicsContext.saveGraphicsState()
            defer { NSGraphicsContext.restoreGraphicsState() }
            NSGraphicsContext.current = context
            let popovers = (window.childWindows ?? []) + NSApp.windows.filter {
                String(describing: type(of: $0)).contains("Popover")
            }
            var drawn = Set<ObjectIdentifier>()
            for popover in popovers where popover !== window && popover.isVisible && popover.frame.intersects(window.frame) {
                guard drawn.insert(ObjectIdentifier(popover)).inserted,
                      let image = CGWindowListCreateImage(
                          .null, .optionIncludingWindow, CGWindowID(popover.windowNumber), [.boundsIgnoreFraming, .bestResolution]
                      )
                else { continue }
                NSBitmapImageRep(cgImage: image).draw(in: NSRect(
                    x: popover.frame.minX - window.frame.minX,
                    y: popover.frame.minY - window.frame.minY,
                    width: popover.frame.width,
                    height: popover.frame.height))
            }
        }
        return rep.representation(using: .png, properties: [:])
    }

    private static var parityOutputDirectory: String? {
        if let dir = ProcessInfo.processInfo.environment["PARITY_OUTPUT_DIR"], !dir.isEmpty {
            return dir
        }
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-PARITY_OUTPUT_DIR"), index + 1 < args.count {
            return args[index + 1]
        }
        return nil
    }
}
