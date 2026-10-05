import AppKit
import CompassData
import CompassKit
import CompassUI

@MainActor
protocol DesktopQuickAddRouting: AnyObject {
    var quickAddHotkeyDisplayString: String { get }
    func setQuickAddHotkey(_ shortcut: String)
    func dismissQuickAddPanel()
}

@MainActor
final class DesktopQuickAddCoordinator: DesktopQuickAddRouting {
    private let hotKeyController: QuickAddHotKeyController
    private let panelController: QuickAddPanelController

    init(appURL: URL) {
        hotKeyController = QuickAddHotKeyController()
        panelController = QuickAddPanelController(appURL: appURL)
        panelController.quickAddRouter = self
        hotKeyController.onHotKeyPressed = { [weak self] in
            self?.panelController.show()
        }
    }

    func configureNativeQuickAdd(
        usesNativeQuickAdd: @escaping () -> Bool,
        nativeModel: @escaping () -> NativeCalendarRootModel?,
        nativeTheme: @escaping () -> NativeWebTheme
    ) {
        panelController.configureNativeQuickAdd(
            usesNativeQuickAdd: usesNativeQuickAdd,
            nativeModel: nativeModel,
            nativeTheme: nativeTheme)
    }

    func presentQuickAddPanel() {
        panelController.show()
    }

    func start() {
        hotKeyController.start()
    }

    var quickAddHotkeyDisplayString: String {
        hotKeyController.binding.displayString
    }

    func setQuickAddHotkey(_ shortcut: String) {
        hotKeyController.applyShortcut(shortcut)
    }

    func dismissQuickAddPanel() {
        panelController.hide()
    }
}
