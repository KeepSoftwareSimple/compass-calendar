import AppKit
import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public var pastePreviewStore: PastePreviewStore { environment.pastePreviewStore }

    public var eventPastePreviewStatusText: String? {
        guard CalendarGridSidebarHints.calendarGridModeHintsEligible(
            isLifeView: viewStore.view == .life)
        else {
            return nil
        }
        guard pastePreviewStore.isActive else { return nil }
        let paste = shortcutRegistry.entries.first { $0.id == .editPaste }?.displayKeycaps.joined(separator: "")
        return "Arrows move · \(paste ?? "⌘V") paste · Esc cancel"
    }

    func beginEventPastePreview(from source: Event) {
        guard draftStore.gridDraft == nil, !isEventFormVisible else { return }
        guard let draft = GridEventDraftFromEvent.duplicateDraft(from: source, calendars: calendars),
              let schedule = Self.initialPasteSchedule(from: source)
        else { return }

        var placed = draft
        placed.schedule = schedule
        placed.clientId = GridEventDraftFactory.makeClientEventId()

        pastePreviewStore.activate()
        draftStore.startGridDraft(activity: .pastePlace, draft: placed)
        rebuildPresentation()
        focusEvent(eventId: placed.clientId.rawValue)
        let text = EventClipboardText.format(event: source)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    public func endEventPastePreview() {
        guard pastePreviewStore.isActive else { return }
        pastePreviewStore.deactivate()
        if draftStore.status.activity == .pastePlace {
            draftStore.discard()
        }
        clearPointerDraftIntent()
        rebuildPresentation()
    }

    static func initialPasteSchedule(from source: Event) -> DraftSchedule? {
        switch source.schedule {
        case .timed(let timed):
            guard let start = CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue),
                  let end = CompassDateParsing.parseInEffectiveTimeZone(timed.end.rawValue)
            else { return nil }
            let duration = end.timeIntervalSince(start)
            let nextStart = end
            return DraftSchedule(start: nextStart, end: nextStart.addingTimeInterval(duration), kind: .timed)
        case .allDay(let allDay):
            guard let start = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.start),
                  let end = CompassDateParsing.calendarDateInEffectiveTimeZone(allDay.end)
            else { return nil }
            let span = max(1, Calendar.current.dateComponents([.day], from: start, to: end).day ?? 1)
            let nextStart = end
            let nextEnd = Calendar.current.date(byAdding: .day, value: span, to: nextStart) ?? nextStart
            return DraftSchedule(start: nextStart, end: nextEnd, kind: .allDay)
        }
    }
}
