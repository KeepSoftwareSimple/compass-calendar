import CompassKit
import SwiftUI

/// Web `BottomNotice`: one compact bottom-left panel.
struct BottomNoticeView<Message: View, Actions: View>: View {
    @Environment(\.nativeWebTheme) private var theme
    var width: CGFloat = NativeWebLayoutTokens.bottomNoticeWidth
    @ViewBuilder var message: () -> Message
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            message()
                .frame(maxWidth: .infinity, alignment: .leading)
            actions()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: width, alignment: .leading)
        .background(theme.surfaceColor.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusPanel))
        .overlay(
            RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusPanel)
                .stroke(theme.borderColor, lineWidth: 1))
        .shadow(color: theme.shadowDefaultColor, radius: 12, y: 4)
    }
}
