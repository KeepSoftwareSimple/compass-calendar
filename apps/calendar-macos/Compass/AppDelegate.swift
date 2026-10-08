import AppKit
import CompassKit
import CompassUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var nativeRootController: NativeRootController?
    private var shortcutsCatalogController: ShortcutsCatalogWindowController?
    /// Menu items hold a weak target; retain the controller for the app lifetime.
    private var mainMenuController: MainMenuController?
    private var quickAddCoordinator: DesktopQuickAddCoordinator?
    private let updater = DesktopUpdater()
    private var optionHeldAtLaunch = false
    private var showDebugMenu = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        optionHeldAtLaunch = NSApp.currentEvent?.modifierFlags.contains(.option) ?? false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        showDebugMenu = DebugMenuPolicy.shouldShow(optionHeldAtLaunch: optionHeldAtLaunch)

        let appURL = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)

        let quickAddCoordinator = DesktopQuickAddCoordinator()
        self.quickAddCoordinator = quickAddCoordinator
        quickAddCoordinator.start()

        let menuController = MainMenuController(
            updater: updater,
            showDebugMenu: showDebugMenu,
            nativeUIState: nativeUIStateProvider())
        menuController.onSelectNativeTheme = { [weak self] theme in
            self?.setNativeTheme(theme)
        }
        menuController.onReloadAppHost = { [weak self] in
            self?.reloadNativeRoot()
        }
        mainMenuController = menuController
        menuController.quickAddCoordinator = quickAddCoordinator
        NSApp.mainMenu = MainMenu.make(controller: menuController)

        updater.onUpdateReady = { [weak self] version in
            self?.nativeRootController?.model.desktopUpdateReadyVersion = version
        }
        updater.start()

        let window = makeMainWindow()
        self.window = window
        installRootContent(on: window)

        if let launchDeepLink = UserDefaults.standard.string(forKey: "COMPASS_LAUNCH_DEEP_LINK") {
            nativeRootController?.receiveDeepLink(urlString: launchDeepLink)
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            nativeRootController?.receiveDeepLink(url)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    private func makeMainWindow() -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Compass"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.toolbar = NSToolbar()
        window.toolbarStyle = .unified
        window.minSize = NSSize(width: 720, height: 480)
        window.isReleasedWhenClosed = false
        window.setContentSize(NSSize(width: 1280, height: 820))
        window.center()
        window.setFrameAutosaveName("CompassMainWindow")
        window.makeKeyAndOrderFront(nil)
        return window
    }

    private func installRootContent(on window: NSWindow) {
        nativeRootController?.keyboardMonitor?.stop()
        (NSApp as? CompassApplication)?.keyboardMonitor = nil

        let theme = NativeUIThemePreference.load()
        let presenter = WebAuthSessionPresenter()
        let catalog = shortcutsCatalogController ?? ShortcutsCatalogWindowController()
        shortcutsCatalogController = catalog
        guard let model = try? NativeRootFactory.makeModel(
            webAuthPresenter: presenter,
            catalogController: catalog
        ) else {
            return
        }
        model.onDesktopRestartToUpdate = { [weak self] in
            self?.updater.restartToUpdate()
        }
        let nativeController = NativeRootController(
            webTheme: theme,
            model: model,
            catalogController: catalog)
        nativeRootController = nativeController
        window.contentViewController = nativeController
        NativeAccessibilityProbes.prepareNativeRootWindowForXCUITest(window)
        mainMenuController?.nativeRootController = nativeController
        if let quickAddCoordinator {
            nativeController.attachQuickAddRouter(quickAddCoordinator)
            quickAddCoordinator.configureNative(model: { [weak nativeController] in nativeController?.model })
        }
        mainMenuController?.refreshNativeUIState(nativeUIStateProvider())
    }

    private func reloadNativeRoot() {
        guard let window else { return }
        nativeRootController = nil
        installRootContent(on: window)
    }

    private func setNativeTheme(_ theme: NativeWebTheme) {
        NativeUIThemePreference.save(theme)
        nativeRootController?.setWebTheme(theme)
        mainMenuController?.refreshNativeUIState(nativeUIStateProvider())
    }

    private func nativeUIStateProvider() -> MainMenuNativeUIState {
        MainMenuNativeUIState(theme: NativeUIThemePreference.load())
    }
}
