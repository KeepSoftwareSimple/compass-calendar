import CompassData
import CompassKit
import SwiftUI

struct BookingStatusHeaderView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var bookingStore: BookingStore
    let savedUrl: String?
    let addressPreview: String?
    let connections: [UserMetadataConnections]
    let calendars: [CompassCalendar]
    let connectableProviders: [ProviderEnum]
    let isConnectBusy: Bool
    let onToggle: (Bool) -> Void
    let onConnect: (ProviderEnum) -> Void
    let onReconnect: (UserMetadataConnections) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(
                "Meeting page",
                isOn: Binding(
                    get: { bookingStore.form.enabled },
                    set: { onToggle($0) }
                )
            )
            .disabled(bookingStore.isSaving)
            if bookingStore.isLive {
                BookingBlockerNoticeView(
                    connections: connections,
                    calendars: calendars,
                    status: bookingStore.status,
                    connectableProviders: connectableProviders,
                    isBusy: isConnectBusy,
                    onConnect: onConnect,
                    onReconnect: onReconnect
                )
            } else if savedUrl != nil {
                Text("Off. Guests can use this link once you turn it on.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textColor)
            } else {
                Text("Off. Turn it on to share your link.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textColor)
                if let addressPreview {
                    Text("It will be at \(addressPreview)")
                        .font(.custom("Rubik", size: 12))
                        .foregroundStyle(theme.textMutedColor)
                }
            }
        }
        .accessibilityIdentifier("booking-status-header")
    }
}
