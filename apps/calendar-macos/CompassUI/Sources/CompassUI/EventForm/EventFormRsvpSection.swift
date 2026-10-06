import CompassData
import CompassKit
import SwiftUI

struct EventFormRsvpSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    private let options: [(ResponseStatusEnum, String)] = [
        (.accepted, "Going"),
        (.tentative, "Maybe"),
        (.declined, "Decline"),
    ]

    var body: some View {
        if model.showRsvpControl(for: draft) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Going?")
                    .font(.custom("Rubik", size: 11))
                    .foregroundStyle(theme.textMutedColor)
                HStack(spacing: 0) {
                    ForEach(options, id: \.0.rawValue) { status, label in
                        Button {
                            Task { await model.selectRsvpResponse(status) }
                        } label: {
                            Text(label)
                                .font(.custom("Rubik", size: 12))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity)
                                .background(selectedStatus == status ? theme.accentColor : theme.surfaceColor)
                                .foregroundStyle(selectedStatus == status ? theme.surfacePanelColor : theme.textMutedColor)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(theme.borderColor, lineWidth: 1))
            }
            .padding(12)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(focusField == .rsvp ? theme.accentColor : theme.borderColor, lineWidth: 1)
            )
            .accessibilityIdentifier("compass-event-form-rsvp")
            .pageJumpChipAnchor(id: "form-rsvp")
        }
    }

    private var selectedStatus: ResponseStatusEnum? {
        guard let email = model.attendeeCalendar(for: draft)?.accountEmail?.lowercased() else { return nil }
        return model.attendeeStatusMap(for: draft)[email]
    }
}
