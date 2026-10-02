import AppKit
import CompassKit
import CompassUI
import SwiftUI

@MainActor
final class NativeRootController: NSHostingController<RootView> {
    private(set) var webTheme: NativeWebTheme {
        didSet {
            applyTheme()
        }
    }

    init(webTheme: NativeWebTheme = .lightBeach) {
        self.webTheme = webTheme
        super.init(rootView: RootView())
        applyTheme()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setWebTheme(_ theme: NativeWebTheme) {
        webTheme = theme
    }

    private func applyTheme() {
        rootView = RootView().environment(\.nativeWebTheme, webTheme)
        DesktopNativeServices.applyAppearance(theme: webTheme.rawValue)
    }
}
