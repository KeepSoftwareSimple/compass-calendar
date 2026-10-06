import AppKit
import CompassKit
import CompassUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var webViewController: WebViewController?
    private var nativeRootController: NativeRootController?
    private var shortcutsCatalogController: ShortcutsCatalogWindowController?
    /// Menu items hold a weak target; retain the controller for the app lifetime.
    private var mainMenuController: MainMenuController?
    private var quickAddCoordinator: DesktopQuickAddCoordinator?
    private let updater = DesktopUpdater()
    private var optionHeldAtLaunch = false
    private var showDebugMenu = false
    private var usingNativeUI = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        optionHeldAtLaunch = NSApp.currentEvent?.modifierFlags.contains(.option) ?? false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        showDebugMenu = DebugMenuPolicy.shouldShow(optionHeldAtLaunch: optionHeldAtLaunch)
        usingNativeUI = NativeUILaunchPolicy.shouldUseNativeUI(showDebugMenu: showDebugMenu)

        let appURL = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)

        let quickAddCoordinator = DesktopQuickAddCoordinator(appURL: appURL)
        self.quickAddCoordinator = quickAddCoordinator
        quickAddCoordinator.start()

        let webViewController = WebViewController(appURL: appURL)
        self.webViewController = webViewController
        webViewController.configureQuickAddRouter(quickAddCoordinator)

        let menuController = MainMenuController(
            webViewController: webViewController,
            updater: updater,
            showDebugMenu: showDebugMenu,
            nativeUIState: nativeUIStateProvider())
        menuController.onToggleNativeUI = { [weak self] in
            self?.toggleNativeUI()
        }
        menuController.onSelectNativeTheme = { [weak self] theme in
            self?.setNativeTheme(theme)
        }
        mainMenuController = menuController
        menuController.quickAddCoordinator = quickAddCoordinator
        refreshQuickAddNativeConfiguration()
        NSApp.mainMenu = MainMenu.make(controller: menuController)

        updater.onUpdateReady = { [weak webViewController] version in
            webViewController?.deliverUpdateReady(version: version)
        }
        webViewController.onRestartToUpdate = { [updater] in
            updater.restartToUpdate()
        }
        updater.start()

        let window = makeMainWindow()
        self.window = window
        installRootContent(on: window)

        if let launchDeepLink = UserDefaults.standard.string(forKey: "COMPASS_LAUNCH_DEEP_LINK") {
            if usingNativeUI {
                nativeRootController?.receiveDeepLink(urlString: launchDeepLink)
            } else {
                webViewController.receiveDeepLink(urlString: launchDeepLink)
            }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        if usingNativeUI {
            for url in urls {
                nativeRootController?.receiveDeepLink(url)
            }
            return
        }
        for url in urls {
            webViewController?.receiveDeepLink(url)
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
        if usingNativeUI {
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
            let nativeController = NativeRootController(
                webTheme: theme,
                model: model,
                catalogController: catalog)
            nativeRootController = nativeController
            window.contentViewController = nativeController
            CompassBridgeAccessibility.prepareNativeRootWindowForXCUITest(window)
            mainMenuController?.nativeRootController = nativeController
            if let quickAddCoordinator {
                nativeController.attachQuickAddRouter(quickAddCoordinator)
            }
            refreshQuickAddNativeConfiguration()
        } else {
            nativeRootController = nil
            guard let webViewController else { return }
            window.contentViewController = webViewController
            webViewController.accessibilityHostWindow = window
            CompassBridgeAccessibility.publishBridgeVersion(BridgeScript.bridgeVersion, on: window)
            refreshQuickAddNativeConfiguration()
        }
    }

    private func toggleNativeUI() {
        if NativeUILaunchPolicy.launchArgumentEnabled == true {
            return
        }
        let next = !NativeUILaunchPolicy.isDebugPreferenceEnabled
        NativeUILaunchPolicy.setDebugPreferenceEnabled(next)
        usingNativeUI = NativeUILaunchPolicy.shouldUseNativeUI(showDebugMenu: showDebugMenu)
        guard let window else { return }
        nativeRootController = nil
        installRootContent(on: window)
        mainMenuController?.refreshNativeUIState(nativeUIStateProvider())
    }

    private func setNativeTheme(_ theme: NativeWebTheme) {
        NativeUIThemePreference.save(theme)
        if !usingNativeUI {
            NativeUILaunchPolicy.setDebugPreferenceEnabled(true)
            usingNativeUI = true
            guard let window else { return }
            nativeRootController = nil
            installRootContent(on: window)
        }
        nativeRootController?.setWebTheme(theme)
        mainMenuController?.refreshNativeUIState(nativeUIStateProvider())
    }

    private func nativeUIStateProvider() -> MainMenuNativeUIState {
        MainMenuNativeUIState(
            isNativeUIEnabled: usingNativeUI,
            theme: NativeUIThemePreference.load())
    }

    private func refreshQuickAddNativeConfiguration() {
        quickAddCoordinator?.configureNativeQuickAdd(
            usesNativeQuickAdd: { [weak self] in self?.usingNativeUI ?? false },
            nativeModel: { [weak self] in self?.nativeRootController?.model },
            nativeTheme: { NativeUIThemePreference.load() })
    }
}
