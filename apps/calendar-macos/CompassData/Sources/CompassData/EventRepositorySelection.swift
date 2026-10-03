import Foundation

/// Mirrors `event.repository.util.ts` / `event.repository.factory.ts`.
public enum EventRepositorySelection {
    public static func source(
        sessionExists: Bool,
        hasUserEverAuthenticated: Bool
    ) -> EventRepositorySource {
        if hasUserEverAuthenticated {
            return .remote
        }
        if sessionExists {
            return .remote
        }
        return .local
    }
}
