import CompassKit
import SwiftUI

struct BookingProviderConnectButtons: View {
    @Environment(\.nativeWebTheme) private var theme
    let providers: [ProviderEnum]
    let isBusy: Bool
    let onConnect: (ProviderEnum) -> Void

    var body: some View {
        ForEach(providers, id: \.self) { provider in
            Button(BookingConnectPromptCopy.connectButtonTitle(provider)) {
                onConnect(provider)
            }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 12))
            .foregroundStyle(theme.accentColor)
            .disabled(isBusy)
        }
    }
}
