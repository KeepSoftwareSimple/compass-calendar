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
            .navMonthCurrent,
            .navUpNext,
            .navJoinMeeting,
            .otherSettings,
            .otherTimeTravel,
        ]
        let overlayIds: Set<ShortcutId> = [
            .otherPalette,
            .otherShortcuts,
            .navGoToDate,
            .otherSidebar,
            .focusSidebar,
            .focusNotice,
            .otherSubscribe,
        ]
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
        handleCommandStateChanged(commandDown: event.modifierFlags.contains(.command))
    }

    func handleCommandStateChanged(commandDown: Bool) {
        if model.settingsStore.isPresented || model.authStore.isModalPresented || model.pendingLogoutConfirmation
            || model.isFeedbackDialogPresented
            || model.pendingDeleteAccountConfirmation
            || model.invitationPrompt != nil || model.pendingRsvpChoice != nil {
            modHold.handleFlagsChanged(modifierDown: false)
            formModHold.handleFlagsChanged(modifierDown: false)
            model.setPageJumpHintsVisible(false)
            model.formFieldDigitHintsVisible = false
            return
        }
        if model.blockPartyKeyboardCaptureActive {
            model.handleBlockPartyFlagsChanged(commandDown: commandDown)
            return
        }
        if model.isEventFormVisible {
            formModHold.handleFlagsChanged(modifierDown: commandDown)
            model.formFieldDigitHintsVisible = formModHold.phase == .hintsVisible
            model.setPageJumpHintsVisible(false)
            return
        }
        modHold.handleFlagsChanged(modifierDown: commandDown)
        model.setPageJumpHintsVisible(modHold.phase == .hintsVisible)
        model.formFieldDigitHintsVisible = false
    }

    func handleKeyUp(_: NSEvent) {}

    func advanceKeyboardClock(by interval: TimeInterval, isActive: Bool) {
        let modalIsPresented = model.settingsStore.isPresented || model.authStore.isModalPresented
            || model.pendingLogoutConfirmation || model.pendingDeleteAccountConfirmation
            || model.isFeedbackDialogPresented || model.invitationPrompt != nil
            || model.pendingRsvpChoice != nil || model.isWelcomeModalActive || model.isLifeViewIntroActive
            || model.dedicationDialogVisible || model.pendingDiscardDraftConfirmation
            || model.pendingRecurrenceScopePrompt != nil || model.pendingConvertToStandaloneConfirmation
        guard isActive && !model.overlayKeyboardCaptureActive && !modalIsPresented else {
            modHold.handleFlagsChanged(modifierDown: false)
            formModHold.handleFlagsChanged(modifierDown: false)
            dispatcher.leaderEngine.disarm()
            if model.focusStore.pageJumpHintsVisible { model.setPageJumpHintsVisible(false) }
            if model.formFieldDigitHintsVisible { model.formFieldDigitHintsVisible = false }
            if model.editSequenceMenuVisible { model.syncEditSequencePhase(.idle) }
            return
        }
        modHold.advanceTime(by: interval)
        formModHold.advanceTime(by: interval)
        dispatcher.leaderEngine.advanceTime(by: interval)
        let pageHints = !model.isEventFormVisible && modHold.phase == .hintsVisible
        let formHints = model.isEventFormVisible && formModHold.phase == .hintsVisible
        if model.focusStore.pageJumpHintsVisible != pageHints { model.setPageJumpHintsVisible(pageHints) }
        if model.formFieldDigitHintsVisible != formHints { model.formFieldDigitHintsVisible = formHints }
        if model.editSequenceMenuVisible != (dispatcher.leaderEngine.phase == .armedWithMenu) {
            model.syncEditSequencePhase(dispatcher.leaderEngine.phase)
        }
    }

    func handleKeyDown(_ event: NSEvent) -> Bool {
        if model.isFeedbackDialogPresented {
            // The text view owns typing. Esc closes, Cmd+Enter sends (web is a
            // form, so a plain Enter would add a line here).
            guard let key = KeyEvent(nsEvent: event) else { return false }
            if key.key == .named(.escape), key.modifiers.isEmpty {
                model.closeFeedbackDialog()
                return true
            }
            return false
        }
        if model.pendingLogoutConfirmation {
            guard let key = KeyEvent(nsEvent: event) else { return false }
            if key.key == .named(.escape), key.modifiers.isEmpty {
                model.cancelLogout()
                return true
            }
            if key.key == .named(.enter), key.modifiers.isEmpty {
                Task { await model.confirmLogout() }
                return true
            }
            return false
        }
        if model.pendingRsvpChoice != nil {
            guard let key = KeyEvent(nsEvent: event) else { return false }
            if key.key == .named(.escape), key.modifiers.isEmpty {
                model.cancelRsvpScopeDialog()
                return true
            }
            return false
        }
        if model.invitationPrompt != nil {
            guard let key = KeyEvent(nsEvent: event) else { return false }
            if key.key == .named(.escape), key.modifiers.isEmpty {
                model.cancelInvitationPrompt()
                return true
            }
            return false
        }
        // Native controls own editing shortcuts, including undo and redo.
        let editingText = (NSApp.keyWindow?.firstResponder as? NSTextView)?.isEditable == true
        let modalOwnsKeyboard = model.settingsStore.isPresented || model.authStore.isModalPresented
        if modalOwnsKeyboard && !model.overlayKeyboardCaptureActive {
            guard let key = KeyEvent(nsEvent: event) else { return false }
            if key.matches(KeyChord(modifiers: [.command], token: .character("k"))) {
                model.toggleCommandPalette()
                return true
            }
            if model.handleSettingsNavigation(key, isTextInputFocused: editingText) {
                return true
            }
            if model.settingsStore.isPresented, model.settingsStore.page == .accounts,
                model.settingsStore.timezoneDialogPurpose == nil, !editingText,
                key.modifiers.isEmpty, case .character(let letter) = key.key {
                if letter == "e" {
                    Task { await model.exportLocalData() }
                    return true
                }
                if letter == "o", model.isSignedIn {
                    model.requestLogout()
                    return true
                }
                if letter == "d" {
                    model.requestDeleteAccount()
                    return true
                }
            }
            if model.settingsStore.isPresented, model.settingsStore.page == .billing,
                model.settingsStore.timezoneDialogPurpose == nil, !editingText,
                key.modifiers.isEmpty, case .character(let letter) = key.key, letter == "s",
                case let .server(server) = model.billingStore.appAccess,
                server.status == .awaitingCheckout
            {
                Task { await model.billingStore.openHostedCheckout() }
                return true
            }
            if key.key == .named(.escape), key.modifiers.isEmpty {
                if model.settingsStore.timezoneDialogPurpose != nil {
                    model.settingsStore.dismissTimezoneDialog()
                } else if model.settingsStore.isPresented {
                    model.closeSettingsIfAllowed()
                } else {
                    model.authStore.closeModal()
                }
                return true
            }
            return false
        }
        if editingText, model.viewStore.view == .life, !model.isLifeViewIntroActive,
            !model.overlayKeyboardCaptureActive
        {
            if let key = KeyEvent(nsEvent: event),
                key.matches(KeyChord(modifiers: [.command], token: .character("k"))) {
                model.toggleCommandPalette()
                return true
            }
            return false
        }
        if editingText, event.modifierFlags.contains(.command),
            event.charactersIgnoringModifiers?.lowercased() == "z" {
            return false
        }
        if !model.overlayKeyboardCaptureActive, handleUndoRedoKeyDown(event) {
            return true
        }
        if handleRecurrenceDeletePromotionKeyDown(event) {
            return true
        }
        if handleToggleShortcutsLegendKeyDown(event) {
            return true
        }
        guard let keyEvent = KeyEvent(nsEvent: event) else { return false }

        if model.isWelcomeModalActive, handleWelcomeKeyDown(keyEvent) {
            return true
        }

        if model.isLifeViewIntroActive, handleLifeViewIntroKeyDown(keyEvent) {
            return true
        }

        if model.blockPartyKeyboardCaptureActive {
            if model.handleBlockPartyKeyDown(keyEvent) {
                return true
            }
            if model.blockPartyStore.gameState.phase != .ended {
                return true
            }
        }

        if model.dedicationDialogVisible {
            if keyEvent.key == .named(.escape) {
                model.dedicationDialogVisible = false
                return true
            }
            return false
        }

        if model.pendingDiscardDraftConfirmation {
            // Web `DiscardUnsavedChangesDialog`: Esc keeps editing, Shift+Esc
            // or Mod+Enter discards.
            if keyEvent.key == .named(.escape) {
                if keyEvent.modifiers == .shift {
                    model.discardDraftConfirmed()
                } else {
                    model.cancelDiscardDraftConfirmation()
                }
                return true
            }
            if keyEvent.key == .named(.enter), keyEvent.modifiers == .command {
                model.discardDraftConfirmed()
                return true
            }
            return false
        }

        if model.pendingRecurrenceScopePrompt != nil {
            if keyEvent.key == .named(.escape) {
                model.cancelRecurrenceScopePrompt()
                return true
            }
            if keyEvent.modifiers.isEmpty, case .character(let char) = keyEvent.key {
                switch char {
                case "1":
                    Task { await model.confirmRecurrenceScope(.this) }
                    return true
                case "2":
                    Task { await model.confirmRecurrenceScope(.thisAndFollowing) }
                    return true
                case "3":
                    Task { await model.confirmRecurrenceScope(.all) }
                    return true
                default:
                    break
                }
            }
            if keyEvent.key == .named(.enter) {
                Task { await model.confirmRecurrenceScope(.this) }
                return true
            }
            return false
        }

        if model.pendingConvertToStandaloneConfirmation {
            if keyEvent.key == .named(.escape) {
                model.cancelConvertToStandaloneConfirmation()
                return true
            }
            if keyEvent.key == .named(.enter) {
                Task { await model.confirmConvertToStandalone() }
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
            return handleOverlayKeyDown(keyEvent)
        }

        if model.isEventFormVisible {
            if handleUITestEventFormTyping(keyEvent) {
                return true
            }
            if handleEventFormKeys(keyEvent) {
                return true
            }
            return false
        }

        // Sidebar and banner focus own their keys before the grid's draft keys,
        // which would read digits as a typed time and Enter as "open event".
        if !model.isEventFormVisible,
           handleMonthPickerFocusKeys(keyEvent)
            || handleNoticeFocusKeys(keyEvent)
            || handleCalendarListFocusKeys(keyEvent)
        {
            return true
        }

        if model.handleNoticeActionKey(
            keyEvent, editSequenceArmed: dispatcher.leaderEngine.phase != .idle)
        {
            return true
        }

        if handleDraftKeys(keyEvent) {
            return true
        }

        if model.isEventFormVisible {
            return false
        }

        if modHold.handleKeyDown(keyEvent) {
            return true
        }

        if keyEvent.modifiers == .shift, case .character(let letter) = keyEvent.key {
            model.handleShiftDayJump(letter: letter)
            return true
        }

        if keyEvent.modifiers.isEmpty, keyEvent.key == .named(.escape), model.eventJumpSelection.isActive {
            model.clearEventJumpSelection()
            return true
        }

        dispatcher.shortcutContext = model.shortcutContext
        syncEditSequenceFieldGating()
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
    /// Probes mirror via `EventFormAccessibilityProbeView` when `-COMPASS_UI_TEST` is set.
    private func handleUITestEventFormTyping(_ keyEvent: KeyEvent) -> Bool {
        guard UITestLaunchPolicy.mirrorsEventFormTitleTyping else { return false }
        // The title probe is a fallback, never a replacement for a real text editor.
        if let editor = NSApp.keyWindow?.firstResponder as? NSTextView, editor.isEditable {
            return false
        }
        if keyEvent.modifiers == [.command],
            case .character(let char) = keyEvent.key,
            char.lowercased() == "v",
            let pasted = NSPasteboard.general.string(forType: .string)
        {
            model.updateDraftFromForm(title: pasted)
            EventFormAccessibilityProbe.syncTitle(pasted)
            return true
        }
        if keyEvent.modifiers == [.command],
            case .character(let char) = keyEvent.key,
            char.lowercased() == "a"
        {
            model.updateDraftFromForm(title: "")
            EventFormAccessibilityProbe.syncTitle("")
            return true
        }
        if keyEvent.modifiers.isEmpty {
            let piece: String? = {
                switch keyEvent.key {
                case .character(let char):
                    return String(char)
                case .punctuation(let punct):
                    return punct
                default:
                    return nil
                }
            }()
            guard let piece, !piece.isEmpty else { return false }
            let current = model.draftStore.gridDraft?.title ?? ""
            let next = current + piece
            model.updateDraftFromForm(title: next)
            EventFormAccessibilityProbe.syncTitle(next)
            return true
        }
        return false
    }

    private func handleEventFormKeys(_ keyEvent: KeyEvent) -> Bool {
        if model.eventFormTimeKeyOwner != nil, keyEvent.modifiers.isEmpty,
            (isSpaceKey(keyEvent.key)
                || [KeyToken.named(.enter), .named(.arrowUp), .named(.arrowDown)].contains(keyEvent.key)) {
            return false
        }
        if EventFormDateFieldKeys.fieldOwnsKey(keyEvent, owner: model.eventFormDateKeyOwner) {
            return false
        }
        if keyEvent.key == .named(.escape), keyEvent.modifiers == [.shift] {
            if model.eventFormDateKeyOwner?.calendarOpen == true { return false }
            model.discardDraftConfirmed()
            return true
        }
        if matchesBinding(keyEvent, id: .editCancelMeeting) {
            guard model.hasBookedMeetingActions else { return false }
            Task { await model.triggerBookedMeetingCancellation() }
            return true
        }
        if matchesBinding(keyEvent, id: .editRescheduleMeeting) {
            guard model.hasBookedMeetingActions else { return false }
            model.rescheduleBookedMeeting()
            return true
        }
        if matchesBinding(keyEvent, id: .editCopyDescriptionLink) {
            return NSApp.sendAction(NSSelectorFromString("copyDescriptionLink:"), to: nil, from: nil)
        }
        if matchesBinding(keyEvent, id: .editCopyMeetingLink) {
            guard let draft = model.draftStore.gridDraft,
                !model.isEventFormReadOnly(for: draft)
            else { return false }
            return model.copyMeetingLinkFromForm()
        }
        if matchesBinding(keyEvent, id: .editToggleAllDay) {
            guard let draft = model.draftStore.gridDraft,
                !model.isEventFormReadOnly(for: draft),
                !model.isScheduleLocked(for: draft)
            else { return false }
            model.setDraftAllDay(draft.schedule.kind != .allDay)
            return true
        }
        if matchesBinding(keyEvent, id: .editOpenDescriptionLink) {
            guard isDescriptionFormEditorFocused() else { return false }
            let opened = NSApp.sendAction(
                NSSelectorFromString("openDescriptionLinkAtCaret:"),
                to: nil,
                from: nil
            )
            if opened { model.recordShortcut(.editOpenDescriptionLink) }
            return opened
        }
        if handleColorSwatchKeys(keyEvent) {
            return true
        }
        if keyEvent.modifiers.isEmpty,
            case .character(let char) = keyEvent.key,
            let digit = Int(String(char)),
            (1...9).contains(digit),
            !isEditableNonDescriptionTextInputFocused()
        {
            let opened = NSApp.sendAction(
                NSSelectorFromString("openDescriptionLinkDigit:"),
                to: nil,
                from: NSNumber(value: digit - 1)
            )
            if opened {
                model.recordShortcut(.editOpenDescriptionLinkDigit)
                return true
            }
        }
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
            if model.cancelBookedMeetingConfirmation() { return true }
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

        // Header buttons own activation and Tab navigation.
        if model.isEventFormActionFocused {
            if keyEvent.key == .named(.enter), keyEvent.modifiers.isEmpty { return false }
            if keyEvent.modifiers.isEmpty, isSpaceKey(keyEvent.key) { return false }
            if keyEvent.key == .named(.tab), keyEvent.modifiers.isEmpty || keyEvent.modifiers == [.shift] {
                return false
            }
        }

        // Return belongs to the current field or control. Only Command+Return saves.
        if keyEvent.key == .named(.enter), keyEvent.modifiers.isEmpty { return false }
        if let textView = NSApp.keyWindow?.firstResponder as? NSTextView, textView.isEditable {
            let isPalette = keyEvent.matches(KeyChord(modifiers: [.command], token: .character("k")))
            guard isPalette else { return false }
        }

        dispatcher.shortcutContext = model.shortcutContext
        syncEditSequenceFieldGating()
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

    /// Web `EventColorPicker` keys while the color field has focus: arrows move
    /// between swatches, Space / Enter pick the focused one, and a pick key
    /// (1-9, 0, -, =) picks that swatch directly.
    private func handleColorSwatchKeys(_ keyEvent: KeyEvent) -> Bool {
        guard model.eventFormFocusedField == .color,
            keyEvent.modifiers.isEmpty,
            !(NSApp.keyWindow?.firstResponder is NSTextView),
            let draft = model.draftStore.gridDraft,
            !model.isEventFormReadOnly(for: draft)
        else { return false }
        switch keyEvent.key {
        case .named(.arrowRight), .named(.arrowDown):
            model.moveColorSwatchFocus(by: 1)
        case .named(.arrowLeft), .named(.arrowUp):
            model.moveColorSwatchFocus(by: -1)
        case .named(.enter), .character(" "):
            model.pickColorSwatch(at: model.colorSwatchFocusIndex)
        case .character(let char):
            guard let index = FormFieldDigitMapping.pickKeyLabels.firstIndex(of: String(char)),
                index < NativeCalendarRootModel.colorSwatchOptions.count
            else { return false }
            model.pickColorSwatch(at: index)
            model.recordShortcut(.editPickByNumber)
        default:
            return false
        }
        return true
    }

    private func syncEditSequenceFieldGating() {
        dispatcher.leaderEngine.isFieldVisible = { [model] field in
            guard let formField = EventFormField(rawValue: field) else { return false }
            return model.isEventFormFocusFieldVisible(formField)
        }
        dispatcher.leaderEngine.canArm = { [model] in
            !model.visibleEditSequenceLetterFields().isEmpty
        }
    }

    private func isDescriptionFormEditorFocused() -> Bool {
        guard let textView = NSApp.keyWindow?.firstResponder as? NSTextView else { return false }
        return textView.accessibilityIdentifier() == "compass-event-form-description"
    }

    private func isEditableNonDescriptionTextInputFocused() -> Bool {
        guard let textView = NSApp.keyWindow?.firstResponder as? NSTextView, textView.isEditable else {
            return false
        }
        return textView.accessibilityIdentifier() != "compass-event-form-description"
    }

    private func matchesBinding(_ keyEvent: KeyEvent, id: ShortcutId) -> Bool {
        registry.bindingsById[id]?.contains(where: { keyEvent.matches($0) }) == true
    }

    private func handleEditSequenceField(_ fieldName: String) {
        guard let field = EventFormField(rawValue: fieldName),
            model.isEventFormFocusFieldVisible(field)
        else { return }
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

        if keyEvent.modifiers.isEmpty, case .character(let char) = keyEvent.key {
            if model.eventJumpSelection.modeActive, model.handleEventJumpKeystroke(char) {
                return true
            }
            guard char.isNumber else { return false }
            model.handleQuickTimeDigit(char)
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

    /// Web `LifeViewIntroModal`: Enter dismisses via primary, Esc dismisses.
    private func handleLifeViewIntroKeyDown(_ keyEvent: KeyEvent) -> Bool {
        guard keyEvent.modifiers.subtracting(.shift).isEmpty else { return false }
        switch keyEvent.key {
        case .named(.enter):
            if !keyEvent.isRepeat {
                model.dismissLifeViewIntro(reason: .primary)
            }
        case .named(.escape):
            model.dismissLifeViewIntro(reason: .escape)
        default:
            break
        }
        return true
    }

    /// Web `WelcomeModal` keys. Bare keys never reach the grid behind the
    /// modal; keys with Command, Option, or Control fall through so menu
    /// shortcuts keep working.
    private func handleWelcomeKeyDown(_ keyEvent: KeyEvent) -> Bool {
        guard keyEvent.modifiers.subtracting(.shift).isEmpty else { return false }
        let step = model.onboardingStore.welcomeStep
        switch keyEvent.key {
        case .named(.enter):
            // A held Enter would blast through every screen and into signup.
            if !keyEvent.isRepeat {
                model.welcomePrimaryAction()
            }
        case .named(.escape):
            model.welcomeBack()
        case .character(let char):
            if char == "i" {
                model.welcomeLogIn()
            } else if step == 2, let digit = char.wholeNumberValue, (1 ... 5).contains(digit) {
                model.onboardingStore.toggleWelcomeFaq(digit - 1)
            } else if step == 3 {
                handleWelcomeLastStepKey(char)
            }
        default:
            break
        }
        return true
    }

    private func handleWelcomeLastStepKey(_ char: Character) {
        if let provider = model.authStore.availableSignInProviders().first(where: { $0.shortcutLetter == char }) {
            model.welcomeSignIn(with: provider)
        } else if char == "u" {
            model.welcomeSignUp()
        } else if char == "s" {
            model.welcomeExplore()
        } else if let link = WelcomeLinks.items.first(where: { $0.key == char }) {
            NSWorkspace.shared.open(link.url)
        }
    }

    /// Arrows move the focused month picker day, Enter goes to it, Escape
    /// leaves. Any other key drops the focus and runs as usual.
    private func handleMonthPickerFocusKeys(_ keyEvent: KeyEvent) -> Bool {
        guard model.monthPickerFocusDate != nil else { return false }
        if keyEvent.modifiers == [.command, .option],
           case .character(let char) = keyEvent.key, char == "j" || char == "k" {
            return false
        }
        guard keyEvent.modifiers.isEmpty else {
            model.clearMonthPickerFocus()
            return false
        }
        switch keyEvent.key {
        case .named(.arrowLeft):
            model.moveMonthPickerFocus(byDays: -1)
        case .named(.arrowRight):
            model.moveMonthPickerFocus(byDays: 1)
        case .named(.arrowUp):
            model.moveMonthPickerFocus(byDays: -7)
        case .named(.arrowDown):
            model.moveMonthPickerFocus(byDays: 7)
        case .named(.enter):
            model.commitMonthPickerFocus()
        case .named(.escape):
            model.clearMonthPickerFocus()
        default:
            model.clearMonthPickerFocus()
            return false
        }
        return true
    }

    /// Enter runs the focused notice's button, Escape leaves. Any other key
    /// (including `p`, which cycles) drops the focus and runs as usual.
    private func handleNoticeFocusKeys(_ keyEvent: KeyEvent) -> Bool {
        guard model.focusedNotice != nil else { return false }
        if keyEvent.modifiers.isEmpty, keyEvent.key == .named(.enter) {
            model.activateFocusedNotice()
            return true
        }
        if keyEvent.modifiers.isEmpty, keyEvent.key == .named(.escape) {
            model.clearNoticeFocus()
            return true
        }
        if keyEvent.key != .character("p") {
            model.clearNoticeFocus()
        }
        return false
    }

    /// Number keys toggle rows in the focused calendar list, Tab moves to the
    /// next list, Escape leaves. Any other key drops the focus and runs as usual.
    private func handleCalendarListFocusKeys(_ keyEvent: KeyEvent) -> Bool {
        guard model.focusedCalendarListKey != nil else { return false }
        if keyEvent.modifiers.isEmpty, case .character(let char) = keyEvent.key,
           NativeCalendarRootModel.calendarPickKeys.contains(char)
        {
            model.pickCalendar(key: char)
            return true
        }
        if keyEvent.modifiers.isEmpty, keyEvent.key == .named(.tab) {
            model.focusNextCalendarList()
            return true
        }
        if keyEvent.modifiers.isEmpty, keyEvent.key == .named(.escape) {
            model.clearCalendarListFocus()
            return true
        }
        model.clearCalendarListFocus()
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
        case .createTimed, .createAllday:
            model.handleShortcut(id)
        case .editOpen:
            if model.draftStore.gridDraft != nil {
                if !model.draftStore.status.isFormOpen {
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
            if event.matches(KeyChord(token: .named(.arrowDown))) {
                model.movePaletteSelection(by: 1)
                return true
            }
            if event.matches(KeyChord(token: .named(.arrowUp))) {
                model.movePaletteSelection(by: -1)
                return true
            }
            if event.matches(KeyChord(token: .named(.enter))) {
                model.activatePaletteSelection()
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

    private func performUndo() {
        if model.draftStore.gridDraft != nil,
            model.draftStore.status.activity == .keyboardPlace
        {
            model.discardDraftConfirmed()
            return
        }
        switch model.undoStore.peekUndo() {
        case .create:
            model.undoKeyboardPlacedCreateNow()
        default:
            model.undoLastChange()
        }
    }

    /// XCUITest and some layouts emit shift+"/" without matching the exported "?" chord path.
    private func handleToggleShortcutsLegendKeyDown(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown,
            !model.isEventFormVisible,
            !model.commandPaletteStore.isOpen,
            event.modifierFlags.intersection([.command, .control, .option]).isEmpty
        else { return false }
        let raw = event.charactersIgnoringModifiers ?? event.characters ?? ""
        let isQuestionMark =
            raw == "?"
            || (raw == "/" && event.modifierFlags.contains(.shift))
            || (event.keyCode == 44 && event.modifierFlags.contains(.shift))
        guard isQuestionMark else { return false }
        model.toggleShortcutsLegend()
        return true
    }

    /// Scope digits after a recurring delete are flaky in XCUITest when normalization fails.
    private func handleRecurrenceDeletePromotionKeyDown(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown,
            model.recurrenceScopeStore.pendingDelete != nil,
            event.modifierFlags.intersection([.command, .control, .option]).isEmpty
        else { return false }
        let digit = event.characters ?? event.charactersIgnoringModifiers
        switch digit {
        case "1":
            model.promotePendingDelete(scope: .thisAndFollowing)
            return true
        case "2":
            model.promotePendingDelete(scope: .all)
            return true
        default:
            return false
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

    private func isSpaceKey(_ key: KeyToken) -> Bool {
        switch key {
        case .character(" "), .punctuation(" "):
            true
        default:
            false
        }
    }

}
