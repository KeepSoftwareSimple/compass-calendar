import AppKit

/// AppKit mirror of a SwiftUI overlay whose only state XCUITest reads is
/// whether it is on screen.
@MainActor
final class OverlayAccessibilityProbeView: AccessibilityProbeView {
    struct Descriptor {
        let identifier: String
        let label: String
        let frame: NSRect
    }

    private let descriptor: Descriptor

    init(descriptor: Descriptor) {
        self.descriptor = descriptor
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(visible: Bool) {
        if visible {
            isHidden = false
            setAccessibilityElement(true)
            setAccessibilityHidden(false)
            setAccessibilityIdentifier(descriptor.identifier)
            setAccessibilityRole(.group)
            setAccessibilityLabel(descriptor.label)
            frame = descriptor.frame
            syncAccessibilityFrame()
        } else {
            isHidden = true
            setAccessibilityElement(false)
            setAccessibilityIdentifier(nil)
            setAccessibilityLabel(nil)
        }
    }
}

/// Owns one overlay probe view: keeps it attached to whichever window
/// XCUITest is driving and publishes visibility to the accessibility tree.
@MainActor
final class OverlayAccessibilityProbe {
    private let descriptor: OverlayAccessibilityProbeView.Descriptor
    private weak var probe: OverlayAccessibilityProbeView?

    init(identifier: String, label: String, frame: NSRect) {
        descriptor = OverlayAccessibilityProbeView.Descriptor(
            identifier: identifier,
            label: label,
            frame: frame
        )
    }

    func attach(to window: NSWindow) {
        guard let host = window.contentView else { return }
        attach(to: host)
    }

    func attach(to hostView: NSView) {
        if let existing = probe, existing.superview === hostView {
            return
        }
        probe?.removeFromSuperview()
        let view = OverlayAccessibilityProbeView(descriptor: descriptor)
        probe = view
        hostView.addSubview(view, positioned: .above, relativeTo: nil)
    }

    func publish(visible: Bool) {
        if probe == nil, let window = NSApp.keyWindow ?? NSApp.mainWindow {
            attach(to: window)
        }
        guard let probe else { return }
        let wasInactive = probe.isHidden
        probe.update(visible: visible)
        if visible {
            if wasInactive {
                NSAccessibility.post(element: probe, notification: .created)
            }
            NSAccessibility.post(element: probe, notification: .focusedUIElementChanged)
        }
        probe.postLayoutChanged()
    }
}

/// The overlay probes the native UI publishes. Identifiers match the SwiftUI
/// views they mirror: `RecurrenceScopeDialogView`, `StatusToastOverlay`, and
/// the shortcuts legend overlay.
@MainActor
enum NativeOverlayProbes {
    static let recurrenceScope = OverlayAccessibilityProbe(
        identifier: "compass-recurrence-scope-dialog",
        label: "Save recurring event",
        frame: NSRect(x: 120, y: 120, width: 200, height: 120)
    )

    static let statusToast = OverlayAccessibilityProbe(
        identifier: "compass-native-status-toast",
        label: "Status",
        frame: NSRect(x: 120, y: 72, width: 240, height: 48)
    )

    static let shortcutsLegend = OverlayAccessibilityProbe(
        identifier: "compass-native-shortcuts-legend",
        label: "Keyboard shortcuts",
        frame: NSRect(x: 160, y: 160, width: 320, height: 240)
    )
}
