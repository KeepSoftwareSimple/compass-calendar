import SwiftUI

struct EventFormSectionChrome: ViewModifier {
    @Environment(\.nativeWebTheme) private var theme
    let focused: Bool

    func body(content: Content) -> some View {
        content
            .padding(12)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(focused ? theme.accentColor : theme.borderColor, lineWidth: 1)
            )
    }
}

extension View {
    func eventFormSectionChrome(focused: Bool) -> some View {
        modifier(EventFormSectionChrome(focused: focused))
    }
}
