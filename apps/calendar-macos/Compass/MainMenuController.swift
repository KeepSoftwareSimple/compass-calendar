import AppKit
import CompassKit
import CompassUI

@MainActor
final class MainMenuController: NSObject {
    private let showDebugMenu: Bool
    private let updater: DesktopUpdater
    private var nativeUIState: MainMenuNativeUIState

    var onSelectNativeTheme: ((NativeWebTheme) -> Void)?
    var onReloadAppHost: (() -> Void)?
    weak var nativeRootController: NativeRootController?
    weak var quickAddCoordinator: DesktopQuickAddCoordinator?

    init(
        updater: DesktopUpdater,
        showDebugMenu: Bool,
        nativeUIState: MainMenuNativeUIState
    ) {
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
                case .standardEdit:
                    item.target = nil
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
        nativeRootController?.model.handleShortcut(.otherSettings)
    }

    @objc private func openHelp(_ sender: Any?) {
        nativeRootController?.model.openShortcutsCatalogWindow()
    }

    @objc private func newEvent(_ sender: Any?) {
        nativeRootController?.model.handleShortcut(.createTimed)
    }

    @objc private func goToday(_ sender: Any?) {
        nativeRootController?.model.handleShortcut(.navToday)
    }

    @objc private func showDay(_ sender: Any?) {
        nativeRootController?.model.handleShortcut(.navDayView)
    }

    @objc private func showWeek(_ sender: Any?) {
        nativeRootController?.model.handleShortcut(.navWeekView)
    }

    @objc private func openCommandPalette(_ sender: Any?) {
        nativeRootController?.model.toggleCommandPalette()
    }

    @objc private func checkForUpdates(_ sender: Any?) {
        updater.checkForUpdates()
    }

    @objc private func restartToUpdate(_ sender: Any?) {
        updater.restartToUpdate()
    }

    @objc private func switchToStaging(_ sender: Any?) {
        AppHostPreference.staging.save()
        onReloadAppHost?()
    }

    @objc private func switchToProduction(_ sender: Any?) {
        AppHostPreference.production.save()
        onReloadAppHost?()
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

}

extension MainMenuController: NSMenuItemValidation {
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(checkForUpdates(_:)):
            return updater.canCheckForUpdates
        case #selector(restartToUpdate(_:)):
            return updater.isUpdateStaged
        case #selector(useNativeThemeLightBeach(_:)):
            item.state = nativeUIState.theme == .lightBeach ? .on : .off
            return true
        case #selector(useNativeThemeDarkAbyss(_:)):
            item.state = nativeUIState.theme == .darkAbyss ? .on : .off
            return true
        default:
            return true
        }
    }
}
