import CompassData
import CompassKit
import SwiftUI

public struct WhichKeyPanelOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    public var model: NativeCalendarRootModel

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.editSequenceMenuVisible {
            VStack(alignment: .leading, spacing: 8) {
                Text("Edit which field?")
                    .font(.custom("Rubik", size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.textMutedColor)
                LazyVGrid(
                    columns: [GridItem(.flexible()), GridItem(.flexible())],
                    alignment: .leading,
                    spacing: 6
                ) {
                    ForEach(model.shortcutRegistry.editSequenceFields.filter { $0.secondKey != nil }, id: \.field) { row in
                        HStack(spacing: 6) {
                            if let key = row.secondKey {
                                ShortcutHintChip(label: String(key).uppercased())
                            }
                            Text(row.label)
                                .font(.custom("Rubik", size: 12, relativeTo: .caption))
                                .foregroundStyle(theme.textColor)
                                .lineLimit(1)
                        }
                    }
                }
                Text("Esc to cancel")
                    .font(.custom("Rubik", size: 11, relativeTo: .caption2))
                    .foregroundStyle(theme.textMutedColor)
            }
            .padding(10)
            .frame(maxWidth: 260, alignment: .leading)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.borderColor, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
            .accessibilityIdentifier("compass-native-which-key-panel")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.top, 120)
            .padding(.leading, 280)
        }
    }
}
