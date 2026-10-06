import CompassData
import CompassKit
import SwiftUI

struct EventFormConferenceSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    var body: some View {
        if model.showCreateConferenceToggle(for: draft),
            let kind = CalendarCapabilities.creatableConferenceKind(on: model.attendeeCalendar(for: draft))
        {
            Toggle(
                isOn: Binding(
                    get: { draft.createConference },
                    set: { model.setDraftCreateConference($0) }
                )
            ) {
                Text("Add \(CalendarCapabilities.conferenceKindLabel(kind))")
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textColor)
            }
            .toggleStyle(.switch)
            .padding(12)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(focusField == .conference ? theme.accentColor : theme.borderColor, lineWidth: 1)
            )
            .accessibilityIdentifier("compass-event-form-conference")
            .pageJumpChipAnchor(id: "form-conference")
        }
    }
}
