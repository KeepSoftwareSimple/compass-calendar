import CompassData
import CompassKit
import SwiftUI

struct EventFormRsvpSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    @FocusState private var focusedResponse: ResponseStatusEnum?

    private let options: [(ResponseStatusEnum, String)] = [
        (.accepted, "Going"),
        (.tentative, "Maybe"),
        (.declined, "Decline"),
    ]

    var body: some View {
        if model.showRsvpControl(for: draft) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Going?")
                    .font(.rubik(11))
                    .foregroundStyle(theme.textMutedColor)
                HStack(spacing: 0) {
                    ForEach(options, id: \.0.rawValue) { status, label in
                        Button {
                            respond(status)
                        } label: {
                            Text(label)
                                .font(.rubik(12))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity)
                                .background(selectedStatus == status ? theme.accentColor : theme.surfaceColor)
                                .foregroundStyle(selectedStatus == status ? theme.onAccentColor : theme.textMutedColor)
                        }
                        .buttonStyle(.plain)
                        .focusable()
                        .focusEffectDisabled()
                        .focused($focusedResponse, equals: status)
                        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow]) { press in
                            guard press.modifiers.isEmpty,
                                let index = options.firstIndex(where: { $0.0 == status }) else { return .ignored }
                            let delta = press.key == .leftArrow || press.key == .upArrow ? -1 : 1
                            let next = options[(index + delta + options.count) % options.count].0
                            focusedResponse = next
                            respond(next)
                            return .handled
                        }
                        .onKeyPress(.return) { respond(status); return .handled }
                        .onKeyPress(.space) { respond(status); return .handled }
                        .overlay {
                            if focusedResponse == status {
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(theme.accentColor, lineWidth: 2)
                                    .padding(2)
                            }
                        }
                        .accessibilityValue(selectedStatus == status ? "Selected" : "Not selected")
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
                    .stroke(focusedResponse != nil ? theme.accentColor : theme.borderColor, lineWidth: 1)
            )
            .accessibilityIdentifier("compass-event-form-rsvp")
            .pageJumpChipAnchor(id: "form-rsvp")
            .onChange(of: model.eventFormRsvpFocusRequest) { _, _ in
                DispatchQueue.main.async {
                    guard model.isEventFormVisible, model.eventFormFocusedField == .rsvp else { return }
                    focusedResponse = selectedStatus.flatMap { status in options.contains(where: { $0.0 == status }) ? status : nil }
                        ?? options.first?.0
                }
            }
        }
    }

    private func respond(_ status: ResponseStatusEnum) {
        Task { await model.selectRsvpResponse(status) }
    }

    private var selectedStatus: ResponseStatusEnum? {
        guard let email = model.attendeeCalendar(for: draft)?.accountEmail?.lowercased() else { return nil }
        return model.attendeeStatusMap(for: draft)[email]
    }
}
