import Foundation

/// Device (browser) timezone at app bootstrap, overridable in tests without touching globals.
public enum CompassDeviceTimeZone {
    private nonisolated(unsafe) static var identifierProvider: () -> String = {
        TimeZone.current.identifier
    }

    public static var currentIdentifier: String {
        identifierProvider()
    }

    public static func setIdentifierProviderForTests(_ provider: @escaping () -> String) {
        identifierProvider = provider
    }

    public static func resetIdentifierProviderForTests() {
        identifierProvider = { TimeZone.current.identifier }
    }
}
