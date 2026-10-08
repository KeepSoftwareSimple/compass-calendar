import CompassData
import CompassKit
import SwiftUI

struct EventFormColorSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Color")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            HStack(spacing: 6) {
                colorSwatch(label: "Default", slot: nil)
                ForEach(EventColorSlot.allCases, id: \.rawValue) { slot in
                    colorSwatch(label: slot.rawValue, slot: slot)
                }
            }
            .accessibilityIdentifier("compass-event-form-color")
            .pageJumpChipAnchor(id: "form-color")
        }
        .eventFormSectionChrome(focused: focusField == .color)
    }

    private func colorSwatch(label: String, slot: EventColorSlot?) -> some View {
        let selected = draft.color == slot
        return Button {
            model.updateDraftFromForm(color: .some(slot))
        } label: {
            Circle()
                .fill(swatchColor(slot))
                .frame(width: 20, height: 20)
                .overlay(
                    Circle()
                        .stroke(selected ? theme.textColor : theme.borderColor, lineWidth: selected ? 2 : 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func swatchColor(_ slot: EventColorSlot?) -> Color {
        guard let slot else { return theme.borderColor }
        switch slot {
        case .blue: return Color(red: 0.2, green: 0.45, blue: 0.95)
        case .coral: return Color(red: 0.95, green: 0.45, blue: 0.4)
        case .gold: return Color(red: 0.9, green: 0.75, blue: 0.2)
        case .green: return Color(red: 0.3, green: 0.7, blue: 0.4)
        case .indigo: return Color(red: 0.35, green: 0.35, blue: 0.85)
        case .lavender: return Color(red: 0.65, green: 0.55, blue: 0.95)
        case .mint: return Color(red: 0.45, green: 0.85, blue: 0.75)
        case .orange: return Color(red: 0.95, green: 0.55, blue: 0.2)
        case .plum: return Color(red: 0.55, green: 0.3, blue: 0.55)
        case .red: return Color(red: 0.9, green: 0.25, blue: 0.25)
        case .slate: return Color(red: 0.45, green: 0.5, blue: 0.55)
        }
    }
}
