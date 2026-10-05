import CompassKit
import Foundation

extension NativeCalendarRootModel {
    /// Clears grid and quick-time state when the macOS quick-add panel opens.
    public func beginQuickAddPanelSession() {
        draftStore.discard()
        rebuildPresentation()
    }

    /// Keeps `DraftStore` in sync with the panel text field (title vs quick-time digits).
    public func syncQuickAddQuery(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            draftStore.setQuickTimeDigits("")
            return
        }
        if trimmed.allSatisfy(\.isNumber) {
            draftStore.setQuickTimeDigits(String(trimmed.prefix(QuickTime.maxDigits)))
            return
        }
        draftStore.setQuickTimeDigits("")
        if draftStore.gridDraft == nil {
            createTimedDraft(activity: .keyboardPlace)
        }
        setDraftTitle(trimmed)
    }

    /// Creates a timed event on the default calendar, then clears draft state.
    public func saveQuickAddFromPanel(submitTitle: String? = nil) async {
        if let submitTitle {
            syncQuickAddQuery(submitTitle)
        }
        if !draftStore.quickTimeDigits.isEmpty {
            commitQuickTimeIfBuffered()
        }
        if draftStore.gridDraft == nil {
            createTimedDraft(activity: .keyboardPlace)
        }
        if let submitTitle, draftStore.gridDraft != nil {
            setDraftTitle(submitTitle)
        }
        await saveDraft()
    }

    public func cancelQuickAddPanelSession() {
        guard draftStore.isDrafting else { return }
        draftStore.discard()
        rebuildPresentation()
    }
}
