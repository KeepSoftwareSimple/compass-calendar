import AppKit
import CompassData
import CompassUI
import SwiftUI

@MainActor
final class QuickAddNativePanelViewController: NSViewController {
    private let model: NativeCalendarRootModel
    private let theme: NativeWebTheme
    private let onSubmit: () -> Void
    private var hostingController: NSHostingController<AnyView>?

    init(model: NativeCalendarRootModel, theme: NativeWebTheme, onSubmit: @escaping () -> Void) {
        self.model = model
        self.theme = theme
        self.onSubmit = onSubmit
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        installHostedQuickAddView()
    }

    private func installHostedQuickAddView() {
        let root = QuickAddView(model: model, onSubmit: onSubmit)
            .environment(\.nativeWebTheme, theme)
        let hosting = NSHostingController(rootView: AnyView(root))
        hostingController?.view.removeFromSuperview()
        hostingController?.removeFromParent()
        hostingController = hosting
        addChild(hosting)
        view = hosting.view
        view.frame = NSRect(x: 0, y: 0, width: 472, height: 120)
    }
}
