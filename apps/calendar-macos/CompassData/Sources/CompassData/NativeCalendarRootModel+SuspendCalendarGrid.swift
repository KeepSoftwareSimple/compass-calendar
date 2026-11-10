import CompassKit

extension NativeCalendarRootModel {
    public var showsKeyboardPlaceSidebarHint: Bool {
        CalendarGridSidebarHints.calendarGridModeHintsEligible(
            isLifeView: viewStore.view == .life)
            && draftStore.status.activity == .keyboardPlace
            && !draftStore.status.isFormOpen
    }

    public var showsLifeThisWeekSidebarTip: Bool {
        viewStore.view == .life && lifeStore.hasBirthDate
    }

    public enum LifeSidebarIdleTip: Equatable, Sendable {
        case thisWeek
        case commandPalette
    }

    /// Matches web `selectShortcutHint` Life pool (T tip or command palette only).
    public var lifeSidebarIdleTip: LifeSidebarIdleTip? {
        guard viewStore.view == .life else { return nil }
        return lifeStore.hasBirthDate ? .thisWeek : .commandPalette
    }

    /// Web `suspendCalendarGridInteraction`: discard invisible grid state when leaving the grid.
    public func suspendCalendarGridInteraction() {
        if draftStore.gridDraft != nil, !draftStore.status.isFormOpen {
            draftStore.discard()
        }
        if pastePreviewStore.isActive {
            endEventPastePreview()
        }
        clearEventJumpSelection()
        draftStore.setQuickTimeDigits("")
        focusStore.resetEdgeFocus()
    }

    func suspendCalendarGridIfEnteringLife(from previous: CalendarGridView) {
        guard previous != .life, viewStore.view == .life else { return }
        suspendCalendarGridInteraction()
    }
}
