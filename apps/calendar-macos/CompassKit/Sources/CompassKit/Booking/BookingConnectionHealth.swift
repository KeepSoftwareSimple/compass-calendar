import Foundation

public enum BookingConnectionHealth {
    public static func hasHealthyConnection(connections: [UserMetadataConnections]) -> Bool {
        connections.contains { isHealthySummary($0) }
    }

    public static func isHealthySummary(_ connection: UserMetadataConnections) -> Bool {
        connection.connectionState == .healthy
    }

    public static func reconnectRequiredConnections(
        _ connections: [UserMetadataConnections]
    ) -> [UserMetadataConnections] {
        connections.filter { isReconnectRequired($0) }
    }

    public static func isReconnectRequired(_ connection: UserMetadataConnections) -> Bool {
        connection.connectionState == .actionRequired
            || connection.connectionState == .disconnected
    }

    public static func isImporting(connections: [UserMetadataConnections]) -> Bool {
        connections.contains { $0.connectionState == .importing || $0.connectionState == .connecting }
    }
}

public enum BookingConnectPromptCopy {
    public static let emptyEnvironment =
        "Calendar sign-in is not configured in this environment."

    public static func prompt(connectable: [ProviderEnum]) -> String {
        if connectable.count <= 1, let provider = connectable.first {
            return singleProviderCopy(provider)
        }
        if connectable.count > 1 {
            return "Connect a calendar account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar."
        }
        return singleProviderCopy(.google)
    }

    private static func singleProviderCopy(_ provider: ProviderEnum) -> String {
        switch provider {
        case .google:
            return "Connect a Google account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar."
        case .microsoft:
            return "Connect a Microsoft account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar."
        case .apple:
            return "Connect an Apple account to enable your meeting page. Guests book through a public link and Compass creates events on your calendar."
        }
    }
}
