import CompassData
import SwiftUI

public struct QuickAddView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable private var model: NativeCalendarRootModel
    @State private var query = ""
    @State private var shouldFocusField = false
    private let onSubmit: () -> Void

    public init(model: NativeCalendarRootModel, onSubmit: @escaping () -> Void) {
        self.model = model
        self.onSubmit = onSubmit
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            QuickAddFieldRepresentable(
                text: $query,
                shouldFocus: shouldFocusField,
                onSubmit: onSubmit,
                onTextChange: { newValue in
                    model.syncQuickAddQuery(newValue)
                }
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(theme.surfacePanelColor)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(theme.borderColor, lineWidth: 1)
            )

            if !model.draftStore.quickTimeDigits.isEmpty {
                Text(quickTimeStatus(model.draftStore.quickTimeDigits))
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityIdentifier("compass-native-quick-add-time-hint")
            }
        }
        .padding(16)
        .frame(width: 440)
        .background(theme.backgroundColor)
        .accessibilityIdentifier("compass-native-quick-add-panel")
        .onAppear {
            query = ""
            shouldFocusField = true
        }
    }

    private func quickTimeStatus(_ digits: String) -> String {
        "New event at \(digits.padding(toLength: 4, withPad: "_", startingAt: 0)) · Esc"
    }
}
