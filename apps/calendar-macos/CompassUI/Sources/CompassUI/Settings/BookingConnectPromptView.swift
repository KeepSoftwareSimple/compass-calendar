import CompassKit
import SwiftUI

struct BookingConnectPromptView: View {
    @Environment(\.nativeWebTheme) private var theme
    let connectableProviders: [ProviderEnum]
    let isBusy: Bool
    let onConnect: (ProviderEnum) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(BookingConnectPromptCopy.prompt(connectable: connectableProviders))
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            if connectableProviders.isEmpty {
                Text(BookingConnectPromptCopy.emptyEnvironment)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
            } else {
                BookingProviderConnectButtons(
                    providers: connectableProviders,
                    isBusy: isBusy,
                    onConnect: onConnect
                )
            }
        }
        .accessibilityIdentifier("booking-connect-prompt")
    }
}
