import CompassKit
import Foundation

public struct ContactsAPI: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func suggestions(query: String) async throws -> ContactSuggestionsResponse {
        try await client.sendDecodable(
            method: "GET",
            path: "contacts/suggestions",
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
    }
}
