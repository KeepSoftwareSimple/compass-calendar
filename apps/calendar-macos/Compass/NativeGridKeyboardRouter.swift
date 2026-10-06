import AppKit
import CompassData
import CompassKit

@MainActor
final class NativeGridKeyboardRouter {
    let dispatcher: ShortcutDispatcher
    let registry: ShortcutRegistry
    private let model: NativeCalendarRootModel
    private let modHold: ModHoldDetector
    private let formModHold: ModHoldDetector
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
        formModHold = HoldModifierDetectorFactory.modHold { [weak model] digit in
            Task { @MainActor in
                model?.jumpEventFormField(digit: digit)
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
        let createIds: Set<ShortcutId> = [
            .createTimed,
            .createAllday,
            .editOpen,
            .createPlaceDiscard,
            .editDuplicate,
            .editSave,
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
        let overlayIds: Set<ShortcutId> = [.otherPalette, .otherShortcuts, .navGoToDate]
        let editIds: Set<ShortcutId> = [
            .editDelete,
            .editDuplicate,
            .editCopy,
            .editPaste,
            .editMenu,
            .editHide,
            .otherUndo,
            .otherRedo,
        ]
        let handlerIds = focusIds.union(navigationIds).union(createIds).union(overlayIds).union(editIds)

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
        if model.isEventFormVisible {
            formModHold.handleFlagsChanged(modifierDown: commandDown, isRepeat: event.isARepeat)
            model.formFieldDigitHintsVisible = formModHold.phase == .hintsVisible
            model.setPageJumpHintsVisible(false)
            return
        }
        modHold.handleFlagsChanged(modifierDown: commandDown, isRepeat: event.isARepeat)
        model.setPageJumpHintsVisible(modHold.phase == .hintsVisible)
        model.formFieldDigitHintsVisible = false
    }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        if handleUndoRedoKeyDown(event) {
            return true
        }
        guard let keyEvent = KeyEvent(nsEvent: event) else { return false }

        if model.dedicationDialogVisible {
            if keyEvent.key == .named(.escape) {
                model.dedicationDialogVisible = false
                return true
            }
            return false
        }

        if model.pendingDiscardDraftConfirmation {
            if keyEvent.key == .named(.escape) {
                model.cancelDiscardDraftConfirmation()
                return true
            }
            return false
        }

        if model.eventMenuStore.isOpen {
            if keyEvent.key == .named(.escape) {
                model.closeEventMenu()
                return true
            }
        }

        if model.recurrenceScopeStore.pendingDelete != nil,
            keyEvent.modifiers.isEmpty,
            case .character(let digit) = keyEvent.key,
            digit == "1" || digit == "2"
        {
            model.promotePendingDelete(scope: digit == "1" ? .thisAndFollowing : .all)
            return true
        }

        dispatcher.isTextInputFocused =
            model.overlayKeyboardCaptureActive || model.isEventFormVisible
        if model.overlayKeyboardCaptureActive {
            if handleOverlayKeyDown(keyEvent) {
                return true
            }
        }

        if model.isEventFormVisible {
            if handleUITestEventFormTyping(keyEvent) {
                return true
            }
            if handleEventFormKeys(keyEvent) {
                return true
            }
        }

        if handleDraftKeys(keyEvent) {
            return true
        }

        if model.isEventFormVisible {
            return false
        }

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
            model.syncEditSequencePhase(dispatcher.leaderEngine.phase)
            performShortcut(id)
            if viewSwitchIds.contains(id) {
                return false
            }
            return true
        }
        model.syncEditSequencePhase(dispatcher.leaderEngine.phase)

        if let field = dispatcher.lastResolvedLeaderField {
            handleEditSequenceField(field)
            return true
        }

        return false
    }

    /// XCUITest typing often misses the SwiftUI title field; mirror keystrokes into the draft.
    private func handleUITestEventFormTyping(_ keyEvent: KeyEvent) -> Bool {
        guard UITestLaunchPolicy.openFocusedEventFormAfterInitialGridFocus else { return false }
        if keyEvent.modifiers == [.command],
            case .character(let char) = keyEvent.key,
            char.lowercased() == "a"
        {
            model.updateDraftFromForm(title: "")
            EventFormAccessibilityProbe.syncTitle("")
            return true
        }
        if keyEvent.modifiers.isEmpty, case .character(let char) = keyEvent.key {
            let piece = String(char)
            guard !piece.isEmpty else { return false }
            let current = model.draftStore.gridDraft?.title ?? ""
            let next = current + piece
            model.updateDraftFromForm(title: next)
            EventFormAccessibilityProbe.syncTitle(next)
            return true
        }
        return false
    }

    private func handleEventFormKeys(_ keyEvent: KeyEvent) -> Bool {
        if keyEvent.modifiers == [.command], keyEvent.key == .named(.enter) {
            Task { await model.saveDraft() }
            return true
        }

        if keyEvent.modifiers == [.command], case .character(let char) = keyEvent.key, char == "d" || char == "D"
        {
            Task { await model.duplicateFocusedOrFormEvent() }
            return true
        }

        if keyEvent.key == .named(.escape), keyEvent.modifiers.isEmpty {
            model.requestCloseEventForm()
            return true
        }

        if formModHold.handleKeyDown(keyEvent) {
            model.formFieldDigitHintsVisible = false
            return true
        }

        if keyEvent.modifiers == [.command], case .character(let char) = keyEvent.key {
            if char.isNumber || char == "-" || char == "=" {
                model.jumpEventFormField(digit: char)
                model.formFieldDigitHintsVisible = false
                return true
            }
        }

        dispatcher.shortcutContext = model.shortcutContext
        if let id = dispatcher.dispatch(keyEvent) {
            performShortcut(id)
            return true
        }

        if let field = dispatcher.lastResolvedLeaderField {
            handleEditSequenceField(field)
            return true
        }

        return false
    }

    private func handleEditSequenceField(_ fieldName: String) {
        guard let field = EventFormField(rawValue: fieldName) else { return }
        if model.isEventFormVisible {
            model.focusEventFormField(field)
            return
        }
        if model.draftStore.gridDraft == nil {
            model.openKeyboardEditForFocusedEvent()
        }
        model.focusEventFormField(field)
    }

    private func handleDraftKeys(_ keyEvent: KeyEvent) -> Bool {
        if keyEvent.modifiers == [.control, .shift],
            case .character(let char) = keyEvent.key,
            char == "0"
        {
            model.toggleDedicationDialog()
            return true
        }

        if keyEvent.modifiers.isEmpty, case .character(let digit) = keyEvent.key, digit.isNumber {
            model.handleQuickTimeDigit(digit)
            if !model.draftStore.quickTimeDigits.isEmpty {
                return true
            }
        }

        let shift = keyEvent.modifiers.contains(.shift)
        let alt = keyEvent.modifiers.contains(.option)
        let arrow: String? = {
            switch keyEvent.key {
            case .named(.arrowUp): return "ArrowUp"
            case .named(.arrowDown): return "ArrowDown"
            case .named(.arrowLeft): return "ArrowLeft"
            case .named(.arrowRight): return "ArrowRight"
            default: return nil
            }
        }()

        if let arrow, shift {
            if model.nudgeDraftOrPlace(key: arrow, shiftKey: true, altKey: alt) {
                return true
            }
        }

        if keyEvent.key == .named(.enter), keyEvent.modifiers.isEmpty {
            if !model.draftStore.quickTimeDigits.isEmpty {
                model.commitQuickTimeIfBuffered()
                return true
            }
            if model.draftStore.gridDraft != nil {
                if model.draftStore.status.isFormOpen {
                    return false
                }
                if model.draftStore.status.activity == .keyboardPlace {
                    model.saveKeyboardPlacedDraftNow()
                    return true
                }
                model.openEventFormForCurrentDraft()
                return true
            }
            if model.focusStore.focusedEventId != nil {
                model.openKeyboardEditForFocusedEvent()
                if model.isEventFormVisible {
                    return true
                }
                return false
            }
        }

        if keyEvent.key == .named(.escape), keyEvent.modifiers.isEmpty {
            if !model.draftStore.quickTimeDigits.isEmpty {
                model.draftStore.setQuickTimeDigits("")
                return true
            }
            if model.draftStore.gridDraft != nil {
                model.requestDiscardDraft()
                return true
            }
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
        case .otherPalette:
            model.toggleCommandPalette()
        case .otherShortcuts:
            model.toggleShortcutsLegend()
        case .navGoToDate:
            model.toggleCommandPalette(fromGoToDate: true)
        case .createTimed:
            model.createTimedDraft(activity: .createShortcut)
        case .createAllday:
            model.createAllDayDraft()
        case .editOpen:
            if model.draftStore.gridDraft != nil {
                if model.draftStore.status.isFormOpen {
                    Task { await model.saveDraft() }
                } else {
                    model.openEventFormForCurrentDraft()
                }
            } else if model.focusStore.focusedEventId != nil {
                model.openKeyboardEditForFocusedEvent()
            }
        case .createPlaceDiscard:
            model.requestDiscardDraft()
        case .editDelete:
            model.deleteFocusedEvent()
        case .editDuplicate:
            Task { await model.duplicateFocusedOrFormEvent() }
        case .editCopy:
            model.copyFocusedEvent()
        case .editPaste:
            model.pasteCopiedEvent()
        case .editMenu:
            model.openEventMenu()
        case .editHide:
            model.toggleFocusedEventHidden()
        case .otherUndo:
            performUndo()
        case .otherRedo:
            model.redoLastChange()
        case .editSave:
            Task { await model.saveDraft() }
        default:
            model.handleShortcut(id)
        }
    }

    private func handleOverlayKeyDown(_ event: KeyEvent) -> Bool {
        if event.matches(KeyChord(token: .named(.escape))) {
            if model.commandPaletteStore.isOpen {
                model.commandPaletteStore.close()
            } else if model.eventMenuStore.isOpen {
                model.closeEventMenu()
            } else {
                model.shortcutsLegendStore.close()
            }
            return true
        }

        if model.commandPaletteStore.isOpen {
            if event.matches(KeyChord(token: .named(.enter))) {
                if let first = model.filteredPaletteSections().flatMap(\.items).first {
                    model.runPaletteCommand(id: first.id)
                }
                return true
            }
            if let id = dispatcher.dispatch(event), id == .otherPalette {
                model.toggleCommandPalette()
                return true
            }
            return false
        }

        if model.shortcutsLegendStore.isOpen {
            return false
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

    private func performUndo() {
        switch model.undoStore.peekUndo() {
        case .create:
            model.undoKeyboardPlacedCreateNow()
        default:
            model.undoLastChange()
        }
    }

    /// XCUITest may synthesize key events that fail `KeyEvent(nsEvent:)` normalization.
    private func handleUndoRedoKeyDown(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown else { return false }
        let command = event.modifierFlags.contains(.command)
        guard command else { return false }
        let isZ = event.keyCode == 6
            || event.charactersIgnoringModifiers?.lowercased() == "z"
        guard isZ else { return false }
        if event.modifierFlags.contains(.shift) {
            model.redoLastChange()
            return true
        }
        performUndo()
        return true
    }

}
