import CompassKit
import SwiftUI

/// Web `BottomNotice`: two-row card (message + dismiss, then primary action).
struct BottomNoticeView<Actions: View>: View {
    @Environment(\.nativeWebTheme) private var theme
    var width: CGFloat = NativeWebLayoutTokens.bottomNoticeWidth
    let message: String
    var onDismiss: (() -> Void)?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(message)
                    .font(.rubik(NativeWebLayoutTokens.fontSizeM, weight: .regular))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let onDismiss {
                    NoticeDismissButton(action: onDismiss)
                }
            }
            actions()
        }
        .padding(12)
        .frame(width: width, alignment: .leading)
        .background(theme.surfaceColor.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusPanel))
        .overlay(
            RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusPanel)
                .stroke(theme.borderColor, lineWidth: 1))
        .shadow(color: theme.shadowDefaultColor.opacity(0.35), radius: 8, y: 3)
    }
}
