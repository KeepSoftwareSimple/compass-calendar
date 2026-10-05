import CompassData
import CompassKit
import SwiftUI

struct EventFormCalendarSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Calendar")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            Picker(
                "Calendar",
                selection: Binding(
                    get: { draft.calendarId?.rawValue ?? "" },
                    set: { id in
                        model.updateDraftFromForm(calendarId: CalendarId(rawValue: id))
                    }
                )
            ) {
                ForEach(writableCalendars, id: \.id) { calendar in
                    Text(calendar.name).tag(calendar.id)
                }
            }
            .labelsHidden()
            .accessibilityIdentifier("compass-event-form-calendar")
            .pageJumpChipAnchor(id: "form-calendar")
        }
        .padding(12)
        .background(theme.surfacePanelColor)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(focusField == .calendar ? theme.accentColor : theme.borderColor, lineWidth: 1)
        )
    }

    private var writableCalendars: [CompassCalendar] {
        model.visibleCalendars().filter(\.capabilities.canWrite)
    }
}
