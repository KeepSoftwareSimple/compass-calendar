import Foundation

public enum PostHogIdentityEvent: Equatable, Sendable {
    case alias(previousAnonymousId: String, userId: String)
}

/// Persists anonymous PostHog distinct ids and coordinates sign-in aliasing.
public struct PostHogIdentityController: Sendable {
    public static let createAliasEventName = "$create_alias"
    public static let aliasPropertyKey = "alias"

    private let defaults: PostHogAnalyticsDefaults
    private let generateDistinctId: @Sendable () -> String
    private var signedInUserId: String?

    public init(
        defaults: PostHogAnalyticsDefaults = UserDefaultsPostHogAnalyticsDefaults(),
        generateDistinctId: @escaping @Sendable () -> String = PostHogAnalyticsIds.makeLowercasedUUID,
        signedInUserId: String? = nil
    ) {
        self.defaults = defaults
        self.generateDistinctId = generateDistinctId
        self.signedInUserId = signedInUserId
    }

    public mutating func distinctIdForCapture() -> String {
        if let signedInUserId {
            return signedInUserId
        }
        return loadOrCreateAnonymousDistinctId()
    }

    /// Links the persisted anonymous id to the signed-in user id, matching web `identify`.
    public mutating func identify(userId: String) -> PostHogIdentityEvent? {
        let trimmed = userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let anonymousId = loadOrCreateAnonymousDistinctId()
        signedInUserId = trimmed
        guard anonymousId != trimmed else { return nil }
        return .alias(previousAnonymousId: anonymousId, userId: trimmed)
    }

    /// Clears the signed-in id and mints a fresh anonymous distinct id for the next session.
    @discardableResult
    public mutating func resetSignedOutIdentity() -> String {
        signedInUserId = nil
        let fresh = generateDistinctId()
        defaults.set(fresh, forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId)
        return fresh
    }

    public func makeAliasCapture(previousAnonymousId: String, userId: String) -> PostHogQueuedCapture {
        PostHogQueuedCapture(
            event: Self.createAliasEventName,
            distinctId: userId,
            properties: [Self.aliasPropertyKey: .string(previousAnonymousId)])
    }

    private mutating func loadOrCreateAnonymousDistinctId() -> String {
        if let stored = defaults.string(forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId),
           !stored.isEmpty
        {
            return stored
        }
        let generated = generateDistinctId()
        defaults.set(generated, forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId)
        return generated
    }
}
