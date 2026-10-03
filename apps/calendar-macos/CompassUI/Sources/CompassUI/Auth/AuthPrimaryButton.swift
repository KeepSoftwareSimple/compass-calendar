import SwiftUI

struct AuthPrimaryButton: View {
    @Environment(\.nativeWebTheme) private var theme
    let title: String
    var disabled = false
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
                Text(title)
                    .font(.custom("Rubik", size: 14, relativeTo: .body))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .foregroundStyle(theme.surfaceColor)
            .background(disabled ? theme.textMutedColor : theme.accentColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(disabled || isLoading)
    }
}

struct AuthLinkButton: View {
    @Environment(\.nativeWebTheme) private var theme
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.accentSecondaryColor)
        }
        .buttonStyle(.plain)
    }
}
