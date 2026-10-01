import AppKit
import CompassKit

@MainActor
final class QuickAddPanelController: NSObject, NSWindowDelegate {
    private let appURL: URL
    weak var quickAddRouter: DesktopQuickAddRouting?
    private var panel: NSPanel?
    private var webViewController: WebViewController?
    private var previousApp: NSRunningApplication?
    private var escapeMonitor: Any?
    private var isVisible = false

    init(appURL: URL) {
        self.appURL = appURL
        super.init()
    }

    func toggle() {
        if isVisible {
            hide()
        } else {
            show()
        }
    }

    func show() {
        if panel == nil {
            buildPanel()
        }
        guard let panel else { return }
        previousApp = NSWorkspace.shared.frontmostApplication
        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        isVisible = true
        installEscapeMonitor()
    }

    func hide() {
        guard isVisible else { return }
        isVisible = false
        removeEscapeMonitor()
        panel?.orderOut(nil)
        if let previousApp {
            previousApp.activate(options: [.activateIgnoringOtherApps])
        }
        previousApp = nil
    }

    private func buildPanel() {
        let launchURL = quickAddLaunchURL(base: appURL)
        let controller = WebViewController(appURL: launchURL, injectQuickAddBridge: true)
        if let quickAddRouter {
            controller.configureQuickAddRouter(quickAddRouter)
        }
        webViewController = controller

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 680, height: 440),
            styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView, .utilityWindow],
            backing: .buffered,
            defer: false)
        panel.title = "Quick add"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.contentViewController = controller
        self.panel = panel
    }

    private func quickAddLaunchURL(base: URL) -> URL {
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        var items = components?.queryItems ?? []
        items.append(URLQueryItem(name: "quickAdd", value: "1"))
        components?.queryItems = items
        return components?.url ?? base
    }

    private func installEscapeMonitor() {
        removeEscapeMonitor()
        escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) {
            [weak self] event in
            guard event.keyCode == 53 else { return event }
            self?.hide()
            return nil
        }
    }

    private func removeEscapeMonitor() {
        if let escapeMonitor {
            NSEvent.removeMonitor(escapeMonitor)
            self.escapeMonitor = nil
        }
    }

    func windowDidResignKey(_ notification: Notification) {
        guard isVisible, let panel = notification.object as? NSPanel, panel === self.panel
        else { return }
        hide()
    }
}
