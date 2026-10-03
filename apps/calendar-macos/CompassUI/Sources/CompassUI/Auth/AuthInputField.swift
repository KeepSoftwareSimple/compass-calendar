import SwiftUI

struct AuthInputField: View {
    @Environment(\.nativeWebTheme) private var theme
    let title: String
    @Binding var text: String
    var error: String?
    var isSecure = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Group {
                if isSecure {
                    SecureField(title, text: $text)
                } else {
                    TextField(title, text: $text)
                }
            }
            .textFieldStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(theme.surfacePanelColor)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(error == nil ? theme.borderColor : theme.errorColor, lineWidth: 1)
            )
            .accessibilityLabel(title)

            if let error {
                Text(error)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.errorColor)
            }
        }
    }
}
