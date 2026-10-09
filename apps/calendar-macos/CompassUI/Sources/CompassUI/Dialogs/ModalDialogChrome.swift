import SwiftUI

/// The chrome every native confirm dialog repeats: the backdrop that covers
/// the window behind it, and the panel's padding, surface, corner, border, and
/// accessibility identifier.
///
/// Shared because a dialog that spells its own chrome drifts from its
/// neighbours one modifier at a time. Width and identifier are the only parts
/// a caller is meant to vary besides its content.
struct ModalDialogChrome: ViewModifier {
    @Environment(\.nativeWebTheme) private var theme
    let maxWidth: CGFloat
    let identifier: String

    func body(content: Content) -> some View {
        ZStack {
            theme.overlayBackdropColor
                .ignoresSafeArea()
            content
                .padding(20)
                .frame(maxWidth: maxWidth)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier(identifier)
        }
    }
}

extension View {
    func modalDialogChrome(maxWidth: CGFloat, identifier: String) -> some View {
        modifier(ModalDialogChrome(maxWidth: maxWidth, identifier: identifier))
    }
}
