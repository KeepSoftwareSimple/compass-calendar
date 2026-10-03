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
                handler: { [weak model] id in
                    Task { @MainActor in
                        switch id {
                        case .navUpNext:
                            model?.openUpNextEvent()
                        case .navJoinMeeting:
                            model?.joinUpNextMeeting()
                        default:
                            model?.handleShortcut(id)
                        }
                    }
                })
        }
        handlers.append(
            ShortcutHandler(
                id: .editCycleEdge,
                scope: .grid,
                chords: [KeyChord(modifiers: [.shift], token: .named(.tab))],
                handler: { [weak model] _ in
                    Task { @MainActor in
                        model?.handleShiftTabCycleEdge()
                    }
                })
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

        if dispatcher.dispatch(keyEvent) != nil {
            return true
        }
        return false
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
