import Foundation

public enum DemoEventsBannerState {
    public static let metadataKey = "compass.onboarding.has-dismissed-demo-events-banner"

    public static func isDismissed(repository: UserMetadataRepository) -> Bool {
        (try? repository.fetch(key: metadataKey)) == "true"
    }

    public static func dismiss(repository: UserMetadataRepository) throws {
        try repository.upsert(key: metadataKey, json: "true")
    }
}
