import CompassData
import SwiftUI

public struct StatusToastOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable private var toastStore: StatusToastStore

    public init(model: NativeCalendarRootModel) {
        _toastStore = Bindable(wrappedValue: model.overlayStores.statusToast)
    }

    public var body: some View {
        if let message = toastStore.message {
            Text(message)
                .font(.custom("Rubik", size: 14, relativeTo: .body))
                .foregroundStyle(theme.textColor)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(theme.surfacePanelColor.opacity(0.98))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.borderColor, lineWidth: 1))
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                .accessibilityIdentifier("compass-native-status-toast")
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 96)
        }
    }
}
