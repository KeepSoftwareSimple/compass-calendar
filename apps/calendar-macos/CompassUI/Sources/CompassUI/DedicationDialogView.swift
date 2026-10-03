import SwiftUI

public struct DedicationDialogView: View {
    @Environment(\.nativeWebTheme) private var theme
    let isPresented: Bool
    let onClose: () -> Void

    public init(isPresented: Bool, onClose: @escaping () -> Void) {
        self.isPresented = isPresented
        self.onClose = onClose
    }

    public var body: some View {
        if isPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture(perform: onClose)
                VStack(alignment: .leading, spacing: 16) {
                    Text("Compass Calendar is dedicated to Derek John Benton (1993-2014).")
                        .font(.custom("Rubik", size: 16))
                        .foregroundStyle(theme.textMutedColor)
                    Text(
                        "\"I have such amazing friends and family and I wish I could slow "
                            + "down time just a little bit so I can take all these "
                            + "relationships in as much as possible. Time is the biggest enemy "
                            + "we all face.\""
                    )
                    .font(.custom("Rubik", size: 20))
                    .foregroundStyle(theme.textColor)
                }
                .padding(24)
                .frame(maxWidth: 520)
                .background(theme.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier("compass-dedication-dialog")
            }
            .transition(.opacity)
        }
    }
}
