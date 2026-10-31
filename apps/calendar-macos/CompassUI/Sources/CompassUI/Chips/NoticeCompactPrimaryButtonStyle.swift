import CompassKit
import SwiftUI

/// Web `NoticePrimaryButton`: ~28pt tall, `text-m` / medium label.
struct NoticeCompactPrimaryButtonStyle: ButtonStyle {
    @Environment(\.nativeWebTheme) private var theme
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.rubik(NativeWebLayoutTokens.fontSizeM, weight: .medium))
            .foregroundStyle(theme.onAccentColor)
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(isHovered || configuration.isPressed ? theme.accentHoverColor : theme.accentColor)
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .onHover { isHovered = $0 }
    }
}
