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
                }
                EventFormCopyLinkButton(
                    label: "copy meeting link",
                    shortcutKeycaps: shortcutKeycaps,
                    isEnabled: true,
                    onCopy: { model.didCopyMeetingLinkFromControl() }
                )
            }
        }
        .accessibilityIdentifier("compass-event-form-conference")
        .pageJumpChipAnchor(id: "form-conference")
        .onChange(of: model.eventFormConferenceFocusRequest) { _, _ in
            DispatchQueue.main.async {
                guard model.isEventFormVisible, model.eventFormFocusedField == .conference else { return }
                linkFocused = true
            }
        }
        .onChange(of: model.eventFormFocusedField) { _, field in
            if field != .conference { linkFocused = false }
        }
    }
}
