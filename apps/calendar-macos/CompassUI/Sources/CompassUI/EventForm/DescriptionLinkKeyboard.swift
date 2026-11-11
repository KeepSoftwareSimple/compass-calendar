import AppKit

/// App-facing API for description link keyboard actions (keeps `Compass` off internal editor hooks).
@MainActor
public enum DescriptionLinkKeyboard {
    /// Injected in unit tests to avoid opening real URLs.
    static var openURLForTests: ((URL) -> Void)?

    /// XCTest bundle hosts often keep `NSApp.keyWindow` nil. Tests set this only after the
    /// description editor and digit-hint overlay are hosted in that specific window
    /// (same ownership model as `CommandPaletteStatusAccessibilityProbe.publish(hostWindow:)`).
    static var keyWindowForDigitHintLookupWhenTesting: NSWindow?

    public static func linkDigitHintsActiveInKeyWindow() -> Bool {
        DescriptionTextView.linkDigitHintsActiveInKeyWindow()
    }

    /// Document-order link open for bare digit `1…9` while digit-hint overlay is active.
    @discardableResult
    public static func openNumberedLinkIfHintsActive(digit: Int) -> String? {
        guard (1...9).contains(digit), linkDigitHintsActiveInKeyWindow(),
              let editor = DescriptionTextView.findInKeyWindow()
        else { return nil }
        let index = digit - 1
        let hrefs = editor.orderedLinkHrefs()
        guard index < hrefs.count, let url = URL(string: hrefs[index]) else { return nil }
        let open: (URL) -> Void = { url in
            if let openURLForTests {
                openURLForTests(url)
            } else {
                NSWorkspace.shared.open(url)
            }
        }
        open(url)
        return hrefs[index]
    }
}
