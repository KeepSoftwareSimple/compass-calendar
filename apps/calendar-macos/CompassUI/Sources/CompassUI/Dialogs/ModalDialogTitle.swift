import SwiftUI

/// The headline every native confirm dialog puts above its body.
struct ModalDialogTitle: View {
    @Environment(\.nativeWebTheme) private var theme
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.custom("Rubik", size: 17, relativeTo: .headline))
            .foregroundStyle(theme.textColor)
    }
}
