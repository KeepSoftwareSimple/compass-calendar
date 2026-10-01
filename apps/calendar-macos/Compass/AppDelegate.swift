import AppKit
import CompassKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var webViewController: WebViewController?
    private var optionHeldAtLaunch = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        optionHeldAtLaunch = NSApp.currentEvent?.modifierFlags.contains(.option) ?? false
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // `-COMPASS_APP_URL <url>` on the command line lands in the
        // UserDefaults argument domain, so tests and local runs can point
        // the window at another origin.
        let appURL = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)

        let webViewController = WebViewController(appURL: appURL)
        self.webViewController = webViewController

        let showDebugMenu = DebugMenuPolicy.shouldShow(
            optionHeldAtLaunch: optionHeldAtLaunch)
        let menuController = MainMenuController(
            webViewController: webViewController,
            showDebugMenu: showDebugMenu)
        NSApp.mainMenu = MainMenu.make(controller: menuController)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Compass"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        // An empty unified toolbar insets the traffic lights from the corner.
        window.toolbar = NSToolbar()
        window.toolbarStyle = .unified
        window.minSize = NSSize(width: 720, height: 480)
        // Closing hides the window; the Dock icon brings the same page back.
        window.isReleasedWhenClosed = false
        window.contentViewController = webViewController
        // Assigning the controller sizes the window to its (zero) view.
        window.setContentSize(NSSize(width: 1280, height: 820))
        window.center()
        // Saves and restores the frame in UserDefaults.
        window.setFrameAutosaveName("CompassMainWindow")
        window.makeKeyAndOrderFront(nil)
        CompassBridgeAccessibility.publishBridgeVersion(BridgeScript.bridgeVersion, on: window)
        self.window = window
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
}
