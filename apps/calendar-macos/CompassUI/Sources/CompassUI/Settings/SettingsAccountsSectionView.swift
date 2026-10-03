import CompassData
import CompassKit
import SwiftUI

struct SettingsAccountsSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var syncStore: SyncConnectionsStore
    @State private var appleEmail = ""
    @State private var applePassword = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Accounts")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            ForEach(syncStore.connections, id: \.id) { connection in
                accountRow(connection)
            }
            connectButtons
            if let error = syncStore.lastError {
                Text(error)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.errorColor)
            }
        }
        .accessibilityIdentifier("settings-section-accounts")
    }

    @ViewBuilder
    private func accountRow(_ connection: UserMetadataConnections) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(connection.accountEmail ?? connection.id)
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textColor)
            HStack(spacing: 8) {
                Button("Reconnect") {
                    Task { await syncStore.reconnect(connection: connection) }
                }
                .disabled(syncStore.isBusy)
                Button("Disconnect") {
                    Task { await syncStore.disconnect(connectionId: connection.id) }
                }
                .disabled(syncStore.isBusy)
            }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 12))
            .foregroundStyle(theme.accentColor)
        }
        .accessibilityIdentifier("settings-accounts-list")
    }

    private var connectButtons: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button("Connect Google") {
                Task { await syncStore.connect(provider: .google) }
            }
            Button("Connect Microsoft") {
                Task { await syncStore.connect(provider: .microsoft) }
            }
            Button("Refresh calendars") {
                Task { await syncStore.refresh() }
            }
            HStack {
                TextField("iCloud email", text: $appleEmail)
                SecureField("App password", text: $applePassword)
            }
            Button("Connect iCloud (app password)") {
                Task {
                    await syncStore.connectAppleCredential(username: appleEmail, secret: applePassword)
                }
            }
            .accessibilityIdentifier("settings-icloud-connect")
        }
        .buttonStyle(.plain)
        .font(.custom("Rubik", size: 12))
        .foregroundStyle(theme.accentColor)
        .disabled(syncStore.isBusy)
    }
}
