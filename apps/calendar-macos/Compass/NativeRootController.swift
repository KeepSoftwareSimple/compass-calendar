import AppKit
import CompassData
import CompassKit
import CompassUI
import SwiftUI

struct ThemedRootView: View {
    let webTheme: NativeWebTheme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        RootView(model: model)
            .environment(\.nativeWebTheme, webTheme)
            .ignoresSafeArea(.container, edges: .top)
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
    private let catalogController: ShortcutsCatalogWindowController?
    private var deepLinkRouter = DeepLinkRouter()
    private(set) var keyboardMonitor: NativeKeyboardMonitor?
    private var resumeMonitor: NativeDesktopResumeMonitor?
    private var notificationScheduler: NotificationScheduler?
    private var agendaSync: NativeAgendaSync?
    private var sidebandTimer: Timer?
    private var settingsBridge: NativeAppSettingsBridge?
    #if DEBUG
    /// `compass://debug/...` commands received before `model.start()` finished.
    private var pendingDebugCommands: [DesktopDebugCommand]? = []
    #endif

    init(webTheme: NativeWebTheme = .lightBeach, model: NativeCalendarRootModel, catalogController: ShortcutsCatalogWindowController? = nil) {
        self.webTheme = webTheme
        self.model = model
        self.catalogController = catalogController
        super.init(rootView: ThemedRootView(webTheme: webTheme, model: model))
        model.onShowAbout = { CompassAboutPanel.present(from: nil) }
        model.feedbackSender = { details, appView in
            try await PostHogCapture.shared.submitFeedback(details: details, appView: appView)
        }
        model.onExportLocalData = { [weak self] data, filename in
            guard let window = self?.view.window else { return false }
            return try await NativeDataExportPresenter.save(data, filename: filename, window: window)
        }
        model.onGridFocusAccessibilityLabelChanged = { [weak self] label in
            let window = Self.compassHostWindow(hostingView: self?.view) ?? NSApp.mainWindow
            if let window {
                GridFocusAccessibilityProbe.attach(to: window)
            }
            GridFocusAccessibilityProbe.publish(label: label)
            NativeAccessibilityProbes.publishNativeGridFocusedEventTitle(label, on: window)
        }
        model.onEventFormTitleAccessibilityProbeChanged = { [weak self] visible in
            guard let self else { return }
            let window = Self.compassHostWindow(hostingView: self.view) ?? NSApp.mainWindow
            if let window {
                EventFormAccessibilityProbe.attach(to: window)
            }
            let title = model.draftStore.gridDraft?.title
            EventFormAccessibilityProbe.publish(
                visible: visible,
                title: title,
                onTitleChanged: visible
                    ? { [weak model] newTitle in model?.updateDraftFromForm(title: newTitle) }
                    : nil
            )
        }
        model.onEventFormTitleAccessibilityProbeTitleSync = { title in
            EventFormAccessibilityProbe.syncTitle(title)
        }
        model.onRecurrenceScopeAccessibilityProbeChanged = { [weak self] visible in
            Self.publish(NativeOverlayProbes.recurrenceScope, visible: visible, hostingView: self?.view)
        }
        model.onStatusToastAccessibilityProbeChanged = { [weak self] visible in
            Self.publish(NativeOverlayProbes.statusToast, visible: visible, hostingView: self?.view)
        }
        model.onShortcutsLegendAccessibilityProbeChanged = { [weak self] open in
            Self.publish(NativeOverlayProbes.shortcutsLegend, visible: open, hostingView: self?.view)
        }
        model.onEventJumpChipsAccessibilityProbeChanged = { [weak self] hints in
            let window = Self.compassHostWindow(hostingView: self?.view) ?? NSApp.mainWindow
            if let window {
                EventJumpChipsAccessibilityProbe.attach(to: window)
            }
            EventJumpChipsAccessibilityProbe.publish(hints: hints)
        }
        model.onCommandPaletteStatusAnnouncementChanged = { [weak self] announcement in
            let window = Self.compassHostWindow(hostingView: self?.view) ?? NSApp.mainWindow
            let payload = announcement.isEmpty ? nil : announcement
            CommandPaletteStatusAccessibilityProbe.publish(announcement: payload, hostWindow: window)
        }
        applyTheme()
        deepLinkRouter.onDeliver = { [weak self] url in
            self?.deliverDeepLink(url)
        }
        configureSettingsBridge()
        configureNativeServices()
        configureKeyboard()
        configureResume()
        model.onParityCapturePresentationApplied = { [weak self] in
            ParityCaptureWindowPolicy.applyIfNeeded(to: self?.view.window)
        }
        Task {
            await model.start()
            deepLinkRouter.markConsumerReady()
            if let launchDeepLink = UserDefaults.standard.string(forKey: "COMPASS_LAUNCH_DEEP_LINK") {
                _ = deepLinkRouter.receive(urlString: launchDeepLink)
            }
            #if DEBUG
            let queued = pendingDebugCommands ?? []
            pendingDebugCommands = nil
            for command in queued {
                await model.runDebugCommand(command)
            }
            #endif
        }
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        ParityCaptureWindowPolicy.scheduleReapply(to: view.window)
        MeetingLinkWideViewportPolicy.scheduleReapply(to: view.window)
        // AppKit hands launch focus to the first key view, the header Previous
        // button, which then draws a ring and swallows Space and typing. The
        // grid owns the keyboard through the router, so start with no control
        // focused. Tab still reaches the buttons. A form already open (UI test
        // launches) keeps its field.
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.model.isEventFormVisible else { return }
            self.view.window?.makeFirstResponder(nil)
        }
        if let window = view.window {
            GridFocusAccessibilityProbe.attach(to: window)
            GridFocusAccessibilityProbe.publish(label: model.gridFocusAccessibilityLabel)
            NativeAccessibilityProbes.publishNativeGridFocusedEventTitle(
                model.gridFocusAccessibilityLabel,
                on: window
            )
            EventFormAccessibilityProbe.attach(to: window)
            EventFormAccessibilityProbe.publish(
                visible: model.isEventFormVisible,
                title: model.draftStore.gridDraft?.title,
                onTitleChanged: { [weak model] newTitle in
                    model?.updateDraftFromForm(title: newTitle)
                }
            )
            NativeOverlayProbes.statusToast.attach(to: window)
            NativeOverlayProbes.shortcutsLegend.attach(to: window)
            EventJumpChipsAccessibilityProbe.attach(to: window)
            EventJumpChipsAccessibilityProbe.publish(hints: model.timeGridState.eventJumpHints)
        }
    }

    /// Attaches to whichever window XCUITest is driving, then mirrors the
    /// overlay's visibility. The window search falls back to the Compass
    /// window by identifier, so a torn-down controller still publishes.
    private static func publish(
        _ probe: OverlayAccessibilityProbe,
        visible: Bool,
        hostingView: NSView?
    ) {
        if let window = compassHostWindow(hostingView: hostingView) ?? NSApp.mainWindow {
            probe.attach(to: window)
        }
        probe.publish(visible: visible)
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
        let bridge = NativeAppSettingsBridge(rootController: self)
        settingsBridge = bridge
        model.settingsStore.setBridge(bridge)
        webTheme = NativeWebTheme(themeName: model.settingsStore.theme)
    }

    func attachQuickAddRouter(_ router: DesktopQuickAddRouting) {
        settingsBridge?.attachQuickAddRouter(router)
        _ = model.settingsStore.setQuickAddHotKey(model.settingsStore.quickAddHotKeyDisplay)
    }

    func receiveDeepLink(_ url: URL) {
        receiveDeepLink(urlString: url.absoluteString)
    }

    func receiveDeepLink(urlString: String) {
        #if DEBUG
        // Shell-driven test commands: run in place without activating the app,
        // so `open -g "compass://debug/..."` never takes the user's focus.
        if let command = DesktopDebugCommand.parse(urlString) {
            if case .parityExport(let surface) = command {
                Task { @MainActor in
                    try? ParityViewSnapshotExporter.export(surface: surface, from: view.window)
                }
                return
            }
            if case .parityApplyCaptureWindow = command {
                Task { @MainActor in
                    ParityViewSnapshotExporter.applyCaptureWindowSize(to: view.window)
                }
                return
            }
            if case .parityExportTitleBarReference = command {
                Task { @MainActor in
                    try? ParityViewSnapshotExporter.exportTitleBarReference(from: view.window)
                }
                return
            }
            if pendingDebugCommands != nil {
                pendingDebugCommands?.append(command)
            } else {
                Task { await model.runDebugCommand(command) }
            }
            return
        }
        #endif
        guard DesktopDeepLinkParser.recognizedURLString(urlString) != nil else { return }
        NSApp.activate(ignoringOtherApps: true)
        view.window?.makeKeyAndOrderFront(nil)
        _ = deepLinkRouter.receive(urlString: urlString)
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

        model.openExternalURLHandler = { url in
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
        let monitor = NativeKeyboardMonitor(router: router, rootView: view)
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
        NSApp.activate(ignoringOtherApps: true)
        view.window?.makeKeyAndOrderFront(nil)
        model.handleDeepLink(url)
        if let path = DesktopDeepLinkParser.navigationPath(for: url) {
            NativeAccessibilityProbes.publishDeepLinkNavigationPath(path, on: view.window)
        }
    }

    func syncNotificationPermission() {}
}
