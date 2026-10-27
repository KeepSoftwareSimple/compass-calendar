import CompassKit
import SwiftUI

/// Web settings field label: `mb-1 text-sm text-text`.
struct SettingsFieldLabel: View {
    @Environment(\.nativeWebTheme) private var theme
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.rubik(14))
            .frame(height: 20)
            .foregroundStyle(theme.textColor)
    }
}

/// Web settings select/button: `w-full rounded border border-border
/// bg-surface-overlay px-2 py-1 text-sm hover:bg-surface-panel`.
struct SettingsSelectChrome: ViewModifier {
    var minimumHeight: CGFloat? = nil
    @Environment(\.nativeWebTheme) private var theme
    @State private var isHovered = false

    func body(content: Content) -> some View {
        content
            .font(.rubik(14))
            .foregroundStyle(theme.textColor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(minHeight: minimumHeight)
            .background(isHovered ? theme.surfacePanelColor : theme.surfaceOverlayColor)
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .overlay(
                RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                    .stroke(theme.borderColor, lineWidth: 1))
            .contentShape(Rectangle())
            .onHover { isHovered = $0 }
    }
}

extension View {
    func settingsSelectChrome(minimumHeight: CGFloat? = nil) -> some View {
        modifier(SettingsSelectChrome(minimumHeight: minimumHeight))
    }
}
