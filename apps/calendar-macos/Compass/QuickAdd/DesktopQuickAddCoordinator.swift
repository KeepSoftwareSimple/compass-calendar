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

    init() {
        hotKeyController = QuickAddHotKeyController()
        panelController = QuickAddPanelController()
        panelController.quickAddRouter = self
        hotKeyController.onHotKeyPressed = { [weak self] in
            self?.panelController.show()
        }
    }

    func configureNative(model: @escaping () -> NativeCalendarRootModel?) {
        panelController.configureNative(model: model)
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
