import CompassData
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
                ForEach(connectableProviders, id: \.self) { provider in
                    Button(connectLabel(provider)) {
                        onConnect(provider)
                    }
                    .buttonStyle(.plain)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.accentColor)
                    .disabled(isBusy)
                }
            }
        }
        .accessibilityIdentifier("booking-connect-prompt")
    }

    private func connectLabel(_ provider: ProviderEnum) -> String {
        switch provider {
        case .google: "Connect Google"
        case .microsoft: "Connect Microsoft"
        case .apple: "Connect iCloud"
        }
    }
}
