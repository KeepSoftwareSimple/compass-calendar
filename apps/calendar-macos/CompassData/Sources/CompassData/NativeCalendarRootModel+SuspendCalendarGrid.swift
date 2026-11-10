import CompassKit

extension NativeCalendarRootModel {
    public var showsKeyboardPlaceSidebarHint: Bool {
        CalendarGridSidebarHints.calendarGridModeHintsEligible(view: viewStore.view)
            && draftStore.status.activity == .keyboardPlace
            && !draftStore.status.isFormOpen
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
