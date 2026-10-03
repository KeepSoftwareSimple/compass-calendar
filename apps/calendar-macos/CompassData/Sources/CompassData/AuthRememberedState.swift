import Foundation

/// Mirrors `hasUserEverAuthenticated()` from the web auth state store.
public enum AuthRememberedState {
    public static let metadataKey = "compass.auth.remembered"

    private struct Payload: Codable {
        var hasAuthenticated: Bool
    }

    public static func hasUserEverAuthenticated(
        repository: UserMetadataRepository
    ) throws -> Bool {
        guard let json = try repository.fetch(key: metadataKey),
              let data = json.data(using: .utf8),
              let payload = try? JSONDecoder().decode(Payload.self, from: data)
        else {
            return false
        }
        return payload.hasAuthenticated
    }

    public static func markUserHasAuthenticated(
        repository: UserMetadataRepository
    ) throws {
        let payload = Payload(hasAuthenticated: true)
        try repository.upsert(key: metadataKey, value: payload)
    }
}
