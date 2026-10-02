import CompassKit
import Foundation

public struct UserAPI: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func profile() async throws -> UserProfile {
        try await client.sendDecodable(method: "GET", path: "user/profile")
    }

    public func metadata() async throws -> UserMetadata {
        try await client.sendDecodable(method: "GET", path: "user/metadata")
    }

    public func updateMetadata(_ metadata: UserMetadata) async throws -> UserMetadata {
        try await client.sendDecodable(method: "POST", path: "user/metadata", body: metadata)
    }

    public func hiddenEventIds() async throws -> [String] {
        let response: HiddenEventIdsResponse = try await client.sendDecodable(
            method: "GET",
            path: "user/hidden-events"
        )
        return response.hiddenEventIds
    }

    public func setHiddenEvents(_ input: SetEventHiddenInput) async throws -> [String] {
        let response: HiddenEventIdsResponse = try await client.sendDecodable(
            method: "PUT",
            path: "user/hidden-events",
            body: input
        )
        return response.hiddenEventIds
    }

    public func deleteAccount() async throws {
        try await client.sendVoid(method: "DELETE", path: "user")
    }
}
