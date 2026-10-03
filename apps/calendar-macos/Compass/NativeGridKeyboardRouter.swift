import AppKit
import CompassData
import CompassKit

@MainActor
final class NativeGridKeyboardRouter {
    let dispatcher: ShortcutDispatcher
    let registry: ShortcutRegistry
    private let model: NativeCalendarRootModel
    private let modHold: ModHoldDetector
    private let eventJumpHold: HoldModifierDetector
    private let viewSwitchIds: Set<ShortcutId> = [.navDayView, .navWeekView, .navLifeView]

    init(model: NativeCalendarRootModel, registry: ShortcutRegistry) {
        self.model = model
        self.registry = registry
        modHold = HoldModifierDetectorFactory.modHold { [weak model] digit in
            Task { @MainActor in
                model?.focusPageJump(digit: digit)
            }
        }
        eventJumpHold = HoldModifierDetectorFactory.eventJumpHold { [weak model] digit in
            Task { @MainActor in
                model?.focusEventJump(digit: digit)
            }
        }

        let focusIds: Set<ShortcutId> = [
            .editFocusPrev,
            .editFocusNext,
            .editFocusLeft,
            .editFocusRight,
            .editCycleEdge,
            .navScrollUp,
            .navScrollDown,
            .navScrollHourUp,
            .navScrollHourDown,
        ]
        let navigationIds: Set<ShortcutId> = [
            .navPrevious,
            .navNext,
            .navToday,
            .navShiftLeft,
            .navShiftRight,
            .navDayView,
            .navWeekView,
            .navLifeView,
            .navLifePrev,
            .navLifeNext,
            .navLifeCurrent,
            .navMonthPrev,
            .navMonthNext,
            .navUpNext,
            .navJoinMeeting,
            .otherSettings,
        ]
        let handlerIds = focusIds.union(navigationIds)

        var handlers = registry.entries.compactMap { entry -> ShortcutHandler? in
            guard handlerIds.contains(entry.id) else { return nil }
            return ShortcutHandler(
                id: entry.id,
                scope: .grid,
                chords: entry.bindingChords,
                when: entry.when,
                handler: { _ in })
        }
        handlers.append(
            ShortcutHandler(
                id: .editCycleEdge,
                scope: .grid,
                chords: [KeyChord(modifiers: [.shift], token: .named(.tab))],
                handler: { _ in })
        )

        let leader = LeaderSequenceEngine(
            leaderKey: registry.editSequenceLeader,
            fieldRows: registry.editSequenceFields)
        dispatcher = ShortcutDispatcher(
            registry: registry,
            handlers: handlers,
            leaderEngine: leader)
    }

    func handleFlagsChanged(_ event: NSEvent) {
        let commandDown = event.modifierFlags.contains(.command)
        modHold.handleFlagsChanged(modifierDown: commandDown, isRepeat: event.isARepeat)
        model.setPageJumpHintsVisible(modHold.phase == .hintsVisible)
    }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        guard let keyEvent = KeyEvent(nsEvent: event) else { return false }

        if case .character(let char) = keyEvent.key, char == "h", keyEvent.modifiers.isEmpty {
            eventJumpHold.handleModifierDown(isRepeat: keyEvent.isRepeat)
            if !keyEvent.isRepeat {
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .milliseconds(280))
                    self?.syncEventJumpHints()
                }
            }
        }

        if eventJumpHold.handleKeyDown(keyEvent) {
            syncEventJumpHints()
            return true
        }
        if modHold.handleKeyDown(keyEvent) {
            return true
        }

        syncEventJumpHints()

        dispatcher.shortcutContext = model.shortcutContext
        if let id = dispatcher.dispatch(keyEvent) {
            performShortcut(id)
            if viewSwitchIds.contains(id) {
                return false
            }
            return true
        }
        return false
    }

    private func performShortcut(_ id: ShortcutId) {
        switch id {
        case .navUpNext:
            model.openUpNextEvent()
        case .navJoinMeeting:
            model.joinUpNextMeeting()
        case .editCycleEdge:
            model.handleShiftTabCycleEdge()
        default:
            model.handleShortcut(id)
        }
    }

    func handleKeyUp(_ event: NSEvent) {
        if event.keyCode == 4 {
            eventJumpHold.handleModifierUp()
            model.setEventJumpHintsVisible(false)
        }
    }

    private func syncEventJumpHints() {
        model.setEventJumpHintsVisible(eventJumpHold.phase == .hintsVisible)
    }
}
