import AppKit
import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var pastePreviewStore: PastePreviewStore { environment.pastePreviewStore }

    public var eventPastePreviewStatusText: String? {
        guard pastePreviewStore.isActive else { return nil }
        let paste = shortcutRegistry.entries.first { $0.id == .editPaste }?.displayKeycaps.joined(separator: "")
        return "Copied · f move day · \(paste ?? "⌘V") paste · Esc cancel"
    }

    func beginEventPastePreview(from source: Event, targetDay: Date) {
        guard draftStore.gridDraft == nil, !isEventFormVisible else { return }
        let ownsJump = !(eventJumpSelection.modeActive || eventJumpSelection.isActive)
        pastePreviewStore.activate(ownsEventJump: ownsJump)
        if ownsJump {
            activateEventJumpMode()
        }
        let key = CompassDateParsing.formatCalendarDay(targetDay)
        eventJumpSelection.selectDay(
            key: key,
            announcement: "Copied. Choose where to paste.",
            buffer: "")
        refreshEventJumpPresentation()
        rebuildPresentation()
        let text = EventClipboardText.format(event: source)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    func endEventPastePreview() {
        guard pastePreviewStore.isActive else { return }
        let ownsJump = pastePreviewStore.ownsEventJump
        pastePreviewStore.deactivate()
        if ownsJump {
            clearEventJumpSelection()
            refreshEventJumpPresentation()
        }
        clearPointerDraftIntent()
        rebuildPresentation()
    }

    func pastePreviewOverlayForPresentation() -> GridLayoutDraftOverlay? {
        guard pastePreviewStore.isActive,
              draftStore.gridDraft == nil,
              let source = clipboardStore.event
        else { return nil }

        let targetDay = draftTargetDay()
        let moved = EventOnTargetDay.moved(source, to: targetDay)
        guard let draft = GridEventDraftFromEvent.duplicateDraft(from: moved, calendars: calendars)
        else { return nil }

        let status = DraftStatus(activity: .keyboardPlace, isFormOpen: false, isDrafting: true)
        return GridEventDraftMapping.overlay(
            from: draft,
            activity: .keyboardPlace,
            status: status,
            sourceColorHex: Self.detailsColorHex(from: moved)
        )
    }
}
