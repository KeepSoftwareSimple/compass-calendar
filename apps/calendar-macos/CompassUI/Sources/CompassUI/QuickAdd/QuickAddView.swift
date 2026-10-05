import CompassData
import SwiftUI

public struct QuickAddView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable private var model: NativeCalendarRootModel
    @FocusState private var fieldFocused: Bool
    @State private var query = ""
    private let onSubmit: () -> Void

    public init(model: NativeCalendarRootModel, onSubmit: @escaping () -> Void) {
        self.model = model
        self.onSubmit = onSubmit
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(
                "Add an event, or type a time like 1130",
                text: $query
            )
            .textFieldStyle(.plain)
            .focused($fieldFocused)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(theme.surfacePanelColor)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(theme.borderColor, lineWidth: 1)
            )
            .accessibilityIdentifier("compass-native-quick-add-field")
            .onSubmit(onSubmit)
            .onChange(of: query) { _, newValue in
                model.syncQuickAddQuery(newValue)
            }

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
            fieldFocused = true
        }
    }

    private func quickTimeStatus(_ digits: String) -> String {
        "New event at \(digits.padding(toLength: 4, withPad: "_", startingAt: 0)) · Esc"
    }
}
