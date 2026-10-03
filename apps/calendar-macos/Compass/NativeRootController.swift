import AppKit
import CompassData
import CompassKit
import CompassUI
import SwiftUI

struct ThemedRootView: View {
    let webTheme: NativeWebTheme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        RootView(model: model).environment(\.nativeWebTheme, webTheme)
    }
}

@MainActor
final class NativeRootController: NSHostingController<ThemedRootView> {
    private(set) var webTheme: NativeWebTheme {
        didSet {
            applyTheme()
        }
    }

    let model: NativeCalendarRootModel
    private(set) var keyboardMonitor: NativeKeyboardMonitor?
    private var resumeMonitor: NativeDesktopResumeMonitor?
    private var notificationScheduler: NotificationScheduler?
    private var agendaSync: NativeAgendaSync?
    private var sidebandTimer: Timer?
    private var settingsBridge: NativeAppSettingsBridge?
    private let quickAddHotKeyController = QuickAddHotKeyController()

    init(webTheme: NativeWebTheme = .lightBeach, model: NativeCalendarRootModel) {
        self.webTheme = webTheme
        self.model = model
        super.init(rootView: ThemedRootView(webTheme: webTheme, model: model))
        model.onGridFocusAccessibilityLabelChanged = { [weak self] label in
            let window = Self.compassHostWindow(hostingView: self?.view) ?? NSApp.mainWindow
            if let window {
                GridFocusAccessibilityProbe.attach(to: window)
            }
            GridFocusAccessibilityProbe.publish(label: label)
            CompassBridgeAccessibility.publishNativeGridFocusedEventTitle(label, on: window)
        }
        applyTheme()
        configureSettingsBridge()
        configureNativeServices()
        configureKeyboard()
        configureResume()
        quickAddHotKeyController.start()
        Task { await model.start() }
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        if let window = view.window {
            GridFocusAccessibilityProbe.attach(to: window)
            GridFocusAccessibilityProbe.publish(label: model.gridFocusAccessibilityLabel)
            CompassBridgeAccessibility.publishNativeGridFocusedEventTitle(
                model.gridFocusAccessibilityLabel,
                on: window
            )
        }
    }

    private static func compassHostWindow(hostingView: NSView?) -> NSWindow? {
        if let hostingView, let window = hostingView.window {
            return window
        }
        return NSApp.windows.first { window in
            window.accessibilityIdentifier() as? String == "Compass"
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setWebTheme(_ theme: NativeWebTheme) {
        NativeUIThemePreference.save(theme)
        webTheme = theme
    }

    private func configureSettingsBridge() {
        let bridge = NativeAppSettingsBridge(
            rootController: self,
            hotKeyController: quickAddHotKeyController)
        settingsBridge = bridge
        model.settingsStore.setBridge(bridge)
        webTheme = NativeWebTheme(themeName: model.settingsStore.theme)
    }

    func receiveDeepLink(_ url: URL) {
        receiveDeepLink(urlString: url.absoluteString)
    }

    func receiveDeepLink(urlString: String) {
        guard DesktopDeepLinkParser.recognizedURLString(urlString) != nil else { return }
        NSApp.activate(ignoringOtherApps: true)
        view.window?.makeKeyAndOrderFront(nil)
        model.handleDeepLink(urlString)
    }

    private func applyTheme() {
        rootView = ThemedRootView(webTheme: webTheme, model: model)
        DesktopNativeServices.applyAppearance(theme: webTheme.rawValue)
    }

    private func configureNativeServices() {
        CompassNotificationCenter.shared.configure(deliverer: self)

        let scheduler = NotificationScheduler()
        notificationScheduler = scheduler
        scheduler.start(model: model)

        let sync = NativeAgendaSync()
        agendaSync = sync
        sync.start(model: model, deepLinkDeliverer: self)

        model.openConferenceURLHandler = { url in
            NSWorkspace.shared.open(url)
        }
        model.onUpNextBannerShown = { [weak scheduler] event in
            Task { await scheduler?.retryBannerNotification(for: event) }
        }
        model.onSidebandDidChange = {
            sync.schedulePush()
            Task { @MainActor in
                await scheduler.notifySidebandDidRefresh()
            }
        }

        sidebandTimer?.invalidate()
        let calendarModel = model
        sidebandTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            Task { @MainActor in
                await calendarModel.refreshSideband()
            }
        }
    }

    private func configureKeyboard() {
        let registry = model.shortcutRegistry
        let router = NativeGridKeyboardRouter(model: model, registry: registry)
        let monitor = NativeKeyboardMonitor(router: router)
        keyboardMonitor = monitor
        monitor.start()
        (NSApp as? CompassApplication)?.keyboardMonitor = monitor
    }

    private func configureResume() {
        let monitor = NativeDesktopResumeMonitor()
        let calendarModel = model
        monitor.onResume = {
            Task { @MainActor in
                await calendarModel.handleResume()
            }
        }
        monitor.start()
        resumeMonitor = monitor
    }
}

extension NativeRootController: CompassNotificationDelivering, CompassAgendaDeepLinkDelivering {
    func deliverDeepLink(_ url: String) {
        receiveDeepLink(urlString: url)
    }

    func syncNotificationPermission() {}
}
