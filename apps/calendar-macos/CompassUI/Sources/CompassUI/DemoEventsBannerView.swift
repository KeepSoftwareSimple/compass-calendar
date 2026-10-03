import SwiftUI

public struct DemoEventsBannerView: View {
    @Environment(\.nativeWebTheme) private var theme
    let onDismiss: () -> Void

    public init(onDismiss: @escaping () -> Void) {
        self.onDismiss = onDismiss
    }

    public var body: some View {
        HStack(spacing: 12) {
            Text("Sample events to help you explore. Clear them from the command palette.")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            Spacer(minLength: 8)
            Text("Okay")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(height: 1)
        }
        .accessibilityIdentifier("compass-native-demo-events-banner")
        .onTapGesture(perform: onDismiss)
    }
}
