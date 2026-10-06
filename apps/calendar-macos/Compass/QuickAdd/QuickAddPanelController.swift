import AppKit
import CompassData
import CompassKit
import CompassUI

@MainActor
final class QuickAddPanelController: NSObject, NSWindowDelegate {
    weak var quickAddRouter: DesktopQuickAddRouting?
    private var panel: NSPanel?
    private var nativePanelController: QuickAddNativePanelViewController?
    private var previousApp: NSRunningApplication?
    private var escapeMonitor: Any?
    private var returnMonitor: Any?
    private var isVisible = false
    /// Menu actions resign key to the main window right after opening the panel. UI tests keep the panel key via `UITestLaunchPolicy`.
    private var suppressResignKeyHideUntil: Date?
    private var isSubmittingNativeQuickAdd = false

    private var nativeModel: () -> NativeCalendarRootModel? = { nil }

    func configureNative(model: @escaping () -> NativeCalendarRootModel?) {
        self.nativeModel = model
    }

    func toggle() {
        if isVisible {
            hide()
        } else {
            show()
        }
    }

    func show() {
        guard nativeModel() != nil else { return }
        if panel == nil || nativePanelController == nil {
            buildNativePanel()
        }
        guard let panel else { return }
        nativeModel()?.beginQuickAddPanelSession()
        previousApp = NSWorkspace.shared.frontmostApplication
        suppressResignKeyHideUntil = Date().addingTimeInterval(0.6)
        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        isVisible = true
        installEscapeMonitor()
        installReturnMonitor()
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isVisible, let panel = self.panel else { return }
            panel.makeKey()
        }
    }

    func hide() {
        guard isVisible else { return }
        isVisible = false
        removeEscapeMonitor()
        removeReturnMonitor()
        nativeModel()?.cancelQuickAddPanelSession()
        panel?.orderOut(nil)
        if let previousApp {
            previousApp.activate(options: [.activateIgnoringOtherApps])
        }
        previousApp = nil
    }

    private func buildNativePanel() {
        guard let model = nativeModel() else { return }
        let theme = NativeUIThemePreference.load()
        let contentController = QuickAddNativePanelViewController(
            model: model,
            theme: theme,
            onSubmit: { [weak self] in
                Task { @MainActor in
                    await self?.submitNativeQuickAdd()
                }
            })
        nativePanelController = contentController

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 472, height: 120),
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
        panel.contentViewController = contentController
        panel.setAccessibilityIdentifier("compass-native-quick-add-window")
        self.panel = panel
    }

    private func submitNativeQuickAdd() async {
        guard !isSubmittingNativeQuickAdd, let model = nativeModel() else { return }
        isSubmittingNativeQuickAdd = true
        defer { isSubmittingNativeQuickAdd = false }
        let submitTitle = nativePanelController?.currentQueryText()
        nativePanelController?.commitQueryToModel()
        await model.saveQuickAddFromPanel(submitTitle: submitTitle)
        quickAddRouter?.dismissQuickAddPanel()
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

    private func installReturnMonitor() {
        removeReturnMonitor()
        returnMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) {
            [weak self] event in
            let isReturn =
                event.keyCode == 36
                || event.keyCode == 76
                || event.charactersIgnoringModifiers == "\r"
            guard isReturn else { return event }
            guard let self, self.isVisible else { return event }
            Task { @MainActor in
                await self.submitNativeQuickAdd()
            }
            return nil
        }
    }

    private func removeReturnMonitor() {
        if let returnMonitor {
            NSEvent.removeMonitor(returnMonitor)
            self.returnMonitor = nil
        }
    }

    func windowDidResignKey(_ notification: Notification) {
        guard isVisible, let panel = notification.object as? NSPanel, panel === self.panel
        else { return }
        if UITestLaunchPolicy.stickyQuickAddPanel {
            DispatchQueue.main.async { [weak self] in
                guard let self, self.isVisible else { return }
                self.panel?.makeKey()
            }
            return
        }
        if let suppressResignKeyHideUntil, Date() < suppressResignKeyHideUntil {
            DispatchQueue.main.async { [weak self] in
                guard let self, self.isVisible else { return }
                self.panel?.makeKey()
            }
            return
        }
        hide()
    }
}
