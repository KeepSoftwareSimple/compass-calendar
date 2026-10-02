import CompassKit
import Foundation

public struct ConfigAPI: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func get() async throws -> AppConfig {
        try await client.sendDecodable(method: "GET", path: "config", auth: .none)
    }
}
