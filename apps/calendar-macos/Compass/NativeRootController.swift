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
    private var keyboardMonitor: NativeKeyboardMonitor?
    private var resumeMonitor: NativeDesktopResumeMonitor?
    private var shortcutDispatcher: ShortcutDispatcher?

    init(webTheme: NativeWebTheme = .lightBeach, model: NativeCalendarRootModel) {
        self.webTheme = webTheme
        self.model = model
        super.init(rootView: ThemedRootView(webTheme: webTheme, model: model))
        applyTheme()
        configureKeyboard()
        configureResume()
        Task { await model.start() }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setWebTheme(_ theme: NativeWebTheme) {
        webTheme = theme
    }

    func presentDebugSignIn(from window: NSWindow?) async {
        guard let credentials = await DebugSignInController.prompt(parentWindow: window) else {
            return
        }
        do {
            try await model.signIn(email: credentials.email, password: credentials.password)
        } catch {
            let alert = NSAlert(error: error)
            alert.messageText = "Sign in failed"
            alert.runModal()
        }
    }

    private func applyTheme() {
        rootView = ThemedRootView(webTheme: webTheme, model: model)
        DesktopNativeServices.applyAppearance(theme: webTheme.rawValue)
    }

    private func configureKeyboard() {
        do {
            let registry = try ShortcutRegistry()
            let navigationIds: Set<ShortcutId> = [
                .navPrevious,
                .navNext,
                .navToday,
                .navShiftLeft,
                .navShiftRight,
                .navDayView,
                .navWeekView,
                .navMonthPrev,
                .navMonthNext,
            ]
            let handlers = registry.entries.compactMap { entry -> ShortcutHandler? in
                guard navigationIds.contains(entry.id) else { return nil }
                return ShortcutHandler(
                    id: entry.id,
                    scope: .grid,
                    chords: entry.bindingChords,
                    handler: { [weak self] id in
                        Task { @MainActor in
                            self?.model.handleShortcut(id)
                        }
                    })
            }
            let leader = LeaderSequenceEngine(
                leaderKey: registry.editSequenceLeader,
                fieldRows: registry.editSequenceFields)
            let dispatcher = ShortcutDispatcher(
                registry: registry,
                handlers: handlers,
                leaderEngine: leader)
            shortcutDispatcher = dispatcher
            keyboardMonitor = NativeKeyboardMonitor(dispatcher: dispatcher)
            keyboardMonitor?.start()
        } catch {
            // Native grid remains usable via header buttons if shortcuts fail to load.
        }
    }

    private func configureResume() {
        let monitor = NativeDesktopResumeMonitor()
        monitor.onResume = { [weak self] in
            Task { @MainActor in
                await self?.model.handleResume()
            }
        }
        monitor.start()
        resumeMonitor = monitor
    }
}
