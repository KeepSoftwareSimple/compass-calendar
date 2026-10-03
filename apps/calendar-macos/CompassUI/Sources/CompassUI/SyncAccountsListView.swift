import CompassData
import CompassKit
import SwiftUI

struct SyncAccountsListView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var store: SyncConnectionsStore
    @State private var appleEmail = ""
    @State private var applePassword = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Accounts")
                .font(.custom("Rubik", size: 13, relativeTo: .headline))
                .foregroundStyle(theme.textMutedColor)
            ForEach(store.connections, id: \.id) { connection in
                accountRow(connection)
            }
            connectButtons
            if let error = store.lastError {
                Text(error)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.errorColor)
            }
        }
    }

    @ViewBuilder
    private func accountRow(_ connection: UserMetadataConnections) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(connection.accountEmail ?? connection.id)
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textColor)
            HStack(spacing: 8) {
                Button("Reconnect") {
                    Task { await store.reconnect(connection: connection) }
                }
                .disabled(store.isBusy)
                Button("Disconnect") {
                    Task { await store.disconnect(connectionId: connection.id) }
                }
                .disabled(store.isBusy)
            }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 12))
            .foregroundStyle(theme.accentColor)
        }
    }

    private var connectButtons: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button("Connect Google") {
                Task { await store.connect(provider: .google) }
            }
            Button("Connect Microsoft") {
                Task { await store.connect(provider: .microsoft) }
            }
            Button("Refresh calendars") {
                Task { await store.refresh() }
            }
            HStack {
                TextField("iCloud email", text: $appleEmail)
                SecureField("App password", text: $applePassword)
            }
            Button("Connect iCloud (app password)") {
                Task {
                    await store.connectAppleCredential(username: appleEmail, secret: applePassword)
                }
            }
        }
        .buttonStyle(.plain)
        .font(.custom("Rubik", size: 12))
        .foregroundStyle(theme.accentColor)
        .disabled(store.isBusy)
    }
}
