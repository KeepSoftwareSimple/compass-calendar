import AppKit
import CompassData
import CompassKit
import CompassUI

@MainActor
final class MainMenuController: NSObject {
    private weak var webViewController: WebViewController?
    private let showDebugMenu: Bool
    private let updater: DesktopUpdater
    private var nativeUIState: MainMenuNativeUIState

    var onToggleNativeUI: (() -> Void)?
    var onSelectNativeTheme: ((NativeWebTheme) -> Void)?
    weak var nativeRootController: NativeRootController?
    weak var quickAddCoordinator: DesktopQuickAddCoordinator?

    init(
        webViewController: WebViewController,
        updater: DesktopUpdater,
        showDebugMenu: Bool,
        nativeUIState: MainMenuNativeUIState
    ) {
        self.webViewController = webViewController
        self.updater = updater
        self.showDebugMenu = showDebugMenu
        self.nativeUIState = nativeUIState
        super.init()
    }

    func refreshNativeUIState(_ state: MainMenuNativeUIState) {
        nativeUIState = state
    }

    func makeMenu() -> NSMenu {
        let menu = NSMenu()
        var windowMenu: NSMenu?

        for section in MainMenuModel.sections(showDebugMenu: showDebugMenu) {
            let submenu = NSMenu(title: section.title)
            for row in section.rows {
                if row.action == .separator {
                    submenu.addItem(.separator())
                    continue
                }
                let item = NSMenuItem(
                    title: row.title,
                    action: selector(for: row.action),
                    keyEquivalent: row.keyEquivalent?.key ?? "")
                switch row.action {
                case .quit:
                    item.target = NSApp
                case let .standardEdit(selectorName):
                    if nativeUIState.isNativeUIEnabled, selectorName == "undo:" {
                        item.action = #selector(undoNativeChange(_:))
                        item.target = self
                    } else if nativeUIState.isNativeUIEnabled, selectorName == "redo:" {
                        item.action = #selector(redoNativeChange(_:))
                        item.target = self
                    } else {
                        item.action = Selector(selectorName)
                        item.target = nil
                    }
                default:
                    item.target = self
                }
                if let key = row.keyEquivalent {
                    item.keyEquivalentModifierMask = modifierMask(for: key)
                }
                submenu.addItem(item)
            }
            let top = NSMenuItem(title: section.title, action: nil, keyEquivalent: "")
            top.submenu = submenu
            menu.addItem(top)
            if section.title == "Window" {
                windowMenu = submenu
            }
        }

        if let windowMenu {
            NSApp.windowsMenu = windowMenu
        }
        NSApp.helpMenu = menu.items.first { $0.title == "Help" }?.submenu
        return menu
    }

    private func selector(for action: MainMenuActionKind) -> Selector? {
        switch action {
        case .separator:
            return nil
        case .showAbout:
            return #selector(showAbout(_:))
        case .quit:
            return #selector(NSApplication.terminate(_:))
        case .openSettings:
            return #selector(openSettings(_:))
        case .openHelp:
            return #selector(openHelp(_:))
        case .shareFeedback:
            return #selector(shareFeedback(_:))
        case let .dispatchShortcut(name):
            switch name {
            case .createTimed: return #selector(newEvent(_:))
            case .navToday: return #selector(goToday(_:))
            case .navDayView: return #selector(showDay(_:))
            case .navWeekView: return #selector(showWeek(_:))
            case .otherPalette: return #selector(openCommandPalette(_:))
            case .otherSettings: return #selector(openSettings(_:))
            case .otherShortcuts: return #selector(openHelp(_:))
            }
        case .checkForUpdates:
            return #selector(checkForUpdates(_:))
        case .restartToUpdate:
            return #selector(restartToUpdate(_:))
        case .switchToStaging:
            return #selector(switchToStaging(_:))
        case .switchToProduction:
            return #selector(switchToProduction(_:))
        case .toggleNativeUI:
            return #selector(toggleNativeUI(_:))
        case .nativeThemeLightBeach:
            return #selector(useNativeThemeLightBeach(_:))
        case .nativeThemeDarkAbyss:
            return #selector(useNativeThemeDarkAbyss(_:))
        case .openQuickAddPanel:
            return #selector(openQuickAddPanel(_:))
        case let .standardEdit(selectorName):
            return Selector(selectorName)
        }
    }

    private func modifierMask(for key: MacKeyEquivalent) -> NSEvent.ModifierFlags {
        var mask: NSEvent.ModifierFlags = []
        if key.command { mask.insert(.command) }
        if key.shift { mask.insert(.shift) }
        if key.option { mask.insert(.option) }
        if key.control { mask.insert(.control) }
        return mask
    }

    @objc private func showAbout(_ sender: Any?) {
        CompassAboutPanel.present(from: sender)
    }

    @objc private func shareFeedback(_ sender: Any?) {
        CompassFeedbackPanel.present()
    }

    @objc private func openSettings(_ sender: Any?) {
        if nativeUIState.isNativeUIEnabled, let nativeRootController {
            nativeRootController.model.handleShortcut(.otherSettings)
            return
        }
        webViewController?.dispatchShortcut(.otherSettings)
    }

    @objc private func openHelp(_ sender: Any?) {
        if nativeUIState.isNativeUIEnabled, let nativeRootController {
            nativeRootController.model.openShortcutsCatalogWindow()
            return
        }
        webViewController?.dispatchShortcut(.otherShortcuts)
    }

    @objc private func newEvent(_ sender: Any?) {
        webViewController?.dispatchShortcut(.createTimed)
    }

    @objc private func goToday(_ sender: Any?) {
        webViewController?.dispatchShortcut(.navToday)
    }

    @objc private func showDay(_ sender: Any?) {
        webViewController?.dispatchShortcut(.navDayView)
    }

    @objc private func showWeek(_ sender: Any?) {
        webViewController?.dispatchShortcut(.navWeekView)
    }

    @objc private func openCommandPalette(_ sender: Any?) {
        if nativeUIState.isNativeUIEnabled, let nativeRootController {
            nativeRootController.model.toggleCommandPalette()
            return
        }
        webViewController?.dispatchShortcut(.otherPalette)
    }

    @objc private func checkForUpdates(_ sender: Any?) {
        updater.checkForUpdates()
    }

    @objc private func restartToUpdate(_ sender: Any?) {
        updater.restartToUpdate()
    }

    @objc private func switchToStaging(_ sender: Any?) {
        AppHostPreference.staging.save()
        webViewController?.reloadAppHost()
    }

    @objc private func switchToProduction(_ sender: Any?) {
        AppHostPreference.production.save()
        webViewController?.reloadAppHost()
    }

    @objc private func toggleNativeUI(_ sender: Any?) {
        onToggleNativeUI?()
    }

    @objc private func useNativeThemeLightBeach(_ sender: Any?) {
        onSelectNativeTheme?(.lightBeach)
    }

    @objc private func useNativeThemeDarkAbyss(_ sender: Any?) {
        onSelectNativeTheme?(.darkAbyss)
    }

    @objc private func openQuickAddPanel(_ sender: Any?) {
        quickAddCoordinator?.presentQuickAddPanel()
    }

    private func nativeCalendarModel() -> NativeCalendarRootModel? {
        if let model = nativeRootController?.model {
            return model
        }
        return (NSApp.keyWindow?.contentViewController as? NativeRootController)?.model
    }

    @objc private func undoNativeChange(_ sender: Any?) {
        nativeCalendarModel()?.undoLastChange()
    }

    @objc private func redoNativeChange(_ sender: Any?) {
        nativeCalendarModel()?.redoLastChange()
    }

}

extension MainMenuController: NSMenuItemValidation {
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(checkForUpdates(_:)):
            return updater.canCheckForUpdates
        case #selector(restartToUpdate(_:)):
            return updater.isUpdateStaged
        case #selector(toggleNativeUI(_:)):
            item.state = nativeUIState.isNativeUIEnabled ? .on : .off
            return true
        case #selector(useNativeThemeLightBeach(_:)):
            item.state = nativeUIState.theme == .lightBeach ? .on : .off
            return true
        case #selector(useNativeThemeDarkAbyss(_:)):
            item.state = nativeUIState.theme == .darkAbyss ? .on : .off
            return true
        case #selector(openQuickAddPanel(_:)):
            return nativeUIState.isNativeUIEnabled
        case #selector(undoNativeChange(_:)):
            return nativeCalendarModel()?.undoStore.canUndo ?? false
        case #selector(redoNativeChange(_:)):
            return nativeCalendarModel()?.undoStore.canRedo ?? false
        default:
            return true
        }
    }
}
