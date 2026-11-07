import AppKit
import CompassData
import CompassKit
import CompassUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private static let windowFrameName = "CompassMainWindow"
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
        WideViewportUITestTrace.resetIfNeeded()
        if UITestLaunchPolicy.meetingLinkWideViewport {
            WideViewportUITestTrace.record(
                "applicationDidFinishLaunching",
                fields: ["wideFlag": "1"])
        }
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
        menuController.onShowMainWindow = { [weak self] in
            self?.window?.makeKeyAndOrderFront(nil)
        }
        mainMenuController = menuController
        menuController.quickAddCoordinator = quickAddCoordinator
        NSApp.mainMenu = MainMenu.make(controller: menuController)

        updater.onUpdateReady = { [weak self] version in
            self?.nativeRootController?.model.desktopUpdateReadyVersion = version
        }
        if !UITestLaunchPolicy.attachesAccessibilityProbes {
            updater.start()
        }

        let window = makeMainWindow()
        self.window = window
        installRootContent(on: window)
        if UITestLaunchPolicy.isParityCapture {
            // Parity XCUITest must match web 1280×820; never restore a narrow autosaved frame.
            ParityCaptureWindowPolicy.scheduleReapply(to: window)
        } else if UITestLaunchPolicy.meetingLinkWideViewport {
            MeetingLinkWideViewportPolicy.scheduleReapply(to: window)
        } else {
            // Installing the content controller resizes the window, so restore the saved frame afterwards.
            window.setFrameUsingName(Self.windowFrameName)
            window.setFrameAutosaveName(Self.windowFrameName)
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
        let contentSize = Self.defaultMainWindowContentSize
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: contentSize.width, height: contentSize.height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Compass"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 720, height: 480)
        window.isReleasedWhenClosed = false
        // Window > Compass reopens it, so AppKit's own window list would repeat it.
        window.isExcludedFromWindowsMenu = true
        window.setContentSize(contentSize)
        window.center()
        window.makeKeyAndOrderFront(nil)
        return window
    }

    private static var defaultMainWindowContentSize: NSSize {
        if UITestLaunchPolicy.meetingLinkWideViewport {
            return NSSize(width: 1440, height: 960)
        }
        return NSSize(width: 1280, height: 820)
    }

    private func installRootContent(on window: NSWindow) {
        nativeRootController?.keyboardMonitor?.stop()
        (NSApp as? CompassApplication)?.keyboardMonitor = nil

        let theme = NativeUIThemePreference.load()
        let presenter = WebAuthSessionPresenter()
        let catalog = shortcutsCatalogController ?? ShortcutsCatalogWindowController()
        shortcutsCatalogController = catalog
        WideViewportUITestTrace.record("installRootContent_begin")
        guard let model = try? NativeRootFactory.makeModel(
            webAuthPresenter: presenter,
            catalogController: catalog
        ) else {
            WideViewportUITestTrace.record("model_init_failed")
            return
        }
        WideViewportUITestTrace.record("model_init_ok")
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
        WideViewportUITestTrace.record(
            "installRootContent_end",
            fields: ["hasNativeRootController": nativeRootController == nil ? "0" : "1"])
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
