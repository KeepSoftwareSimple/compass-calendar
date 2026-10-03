import AppKit
import CompassData
import CompassKit
import CompassUI
import SwiftUI

@MainActor
final class ShortcutsCatalogWindowController: NSWindowController, ShortcutsCatalogPresenting {
    private var hostingController: NSHostingController<AnyView>?

    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        window.title = "Compass keyboard shortcuts"
        window.setContentSize(NSSize(width: 720, height: 820))
        window.center()
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func presentPublicCatalog(sections: [ShortcutLegendSection]) {
        let theme = NativeUIThemePreference.load()
        let view = ShortcutsCatalogView(sections: sections)
            .environment(\.nativeWebTheme, theme)
        let host = NSHostingController(rootView: AnyView(view))
        hostingController = host
        window?.contentViewController = host
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
