import AppKit
import CompassKit

@MainActor
final class MainMenuController: NSObject {
    private weak var webViewController: WebViewController?
    private let showDebugMenu: Bool

    init(webViewController: WebViewController, showDebugMenu: Bool) {
        self.webViewController = webViewController
        self.showDebugMenu = showDebugMenu
        super.init()
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
        case .switchToStaging:
            return #selector(switchToStaging(_:))
        case .switchToProduction:
            return #selector(switchToProduction(_:))
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
        NSApp.orderFrontStandardAboutPanel(sender)
    }

    @objc private func openSettings(_ sender: Any?) {
        webViewController?.dispatchShortcut(.otherSettings)
    }

    @objc private func openHelp(_ sender: Any?) {
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
        webViewController?.dispatchShortcut(.otherPalette)
    }

    @objc private func switchToStaging(_ sender: Any?) {
        AppHostPreference.staging.save()
        webViewController?.reloadAppHost()
    }

    @objc private func switchToProduction(_ sender: Any?) {
        AppHostPreference.production.save()
        webViewController?.reloadAppHost()
    }
}
