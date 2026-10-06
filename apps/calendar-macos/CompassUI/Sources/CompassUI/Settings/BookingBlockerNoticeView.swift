import CompassData
import CompassKit
import SwiftUI

struct BookingBlockerNoticeView: View {
    @Environment(\.nativeWebTheme) private var theme
    let connections: [UserMetadataConnections]
    let calendars: [CompassCalendar]
    let hasHealthyConnection: Bool
    let status: BookingPageStatusResponse?
    let connectableProviders: [ProviderEnum]
    let isBusy: Bool
    let onConnect: (ProviderEnum) -> Void
    let onReconnect: (UserMetadataConnections) -> Void

    private var blocker: BookingBlocker? {
        BookingBlockerLogic.selectBookingBlocker(
            connections: connections,
            calendars: calendars,
            hasHealthyConnection: hasHealthyConnection,
            status: status
        )
    }

    var body: some View {
        if let blocker {
            VStack(alignment: .leading, spacing: 8) {
                Text(blocker.message)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textColor)
                    .accessibilityIdentifier("booking-blocker-message")
                if blocker.action == .reconnect {
                    ForEach(reconnectTargets, id: \.id) { connection in
                        Button("Reconnect") {
                            onReconnect(connection)
                        }
                        .buttonStyle(.plain)
                        .font(.custom("Rubik", size: 12))
                        .foregroundStyle(theme.accentColor)
                        .disabled(isBusy)
                    }
                }
                if blocker.action == .connect {
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
        }
    }

    private var reconnectTargets: [UserMetadataConnections] {
        let required = BookingConnectionHealth.reconnectRequiredConnections(connections)
        if !required.isEmpty { return required }
        return connections
    }

    private func connectLabel(_ provider: ProviderEnum) -> String {
        switch provider {
        case .google: "Connect Google"
        case .microsoft: "Connect Microsoft"
        case .apple: "Connect iCloud"
        }
    }
}
