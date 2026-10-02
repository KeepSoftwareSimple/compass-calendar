import AppKit
import CompassKit
import CompassUI
import SwiftUI

private struct ThemedRootView: View {
    let webTheme: NativeWebTheme

    var body: some View {
        RootView().environment(\.nativeWebTheme, webTheme)
    }
}

@MainActor
final class NativeRootController: NSHostingController<ThemedRootView> {
    private(set) var webTheme: NativeWebTheme {
        didSet {
            applyTheme()
        }
    }

    init(webTheme: NativeWebTheme = .lightBeach) {
        self.webTheme = webTheme
        super.init(rootView: ThemedRootView(webTheme: webTheme))
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
        rootView = ThemedRootView(webTheme: webTheme)
        DesktopNativeServices.applyAppearance(theme: webTheme.rawValue)
    }
}
