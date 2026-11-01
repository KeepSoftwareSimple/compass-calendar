import CompassData
import CompassKit
import SwiftUI

struct EventFormMeetingLinkRow: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let url: String
    let label: String
    @FocusState private var linkFocused: Bool

    private var shortcutKeycaps: [String] {
        model.shortcutRegistry.entries.first { $0.id == .editCopyMeetingLink }?.displayKeycaps ?? []
    }

    var body: some View {
        EventFormIconRow(icon: .videoCamera) {
            HStack(spacing: 8) {
                if let link = URL(string: url) {
                    Link(destination: link) {
                        Text(label)
                            .font(.rubik(12))
                            .foregroundStyle(theme.textColor)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .accessibilityIdentifier("compass-event-form-conference")
                    .buttonStyle(.plain)
                    .focusable()
                    .focusEffectDisabled()
                    .focused($linkFocused)
                    .overlay {
                        if linkFocused {
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(theme.accentColor, lineWidth: 1)
                                .padding(-3)
                        }
                    }
                } else {
                    Text(label)
                        .font(.rubik(12))
                        .foregroundStyle(theme.textColor)
                        .lineLimit(1)
                        .accessibilityIdentifier("compass-event-form-conference")
                }
                EventFormCopyLinkButton(
                    label: "copy meeting link",
                    shortcutKeycaps: shortcutKeycaps,
                    isEnabled: true,
                    onCopy: { model.didCopyMeetingLinkFromControl() }
                )
            }
        }
        .pageJumpChipAnchor(id: "form-conference")
        .onEventFormFocusRequest(model, field: .conference) {
            linkFocused = true
        }
        .onChange(of: model.eventFormFocusedField) { _, field in
            if field != .conference { linkFocused = false }
        }
    }
}
