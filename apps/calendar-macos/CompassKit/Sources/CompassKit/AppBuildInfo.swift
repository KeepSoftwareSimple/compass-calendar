import Foundation

/// Marketing and bundle versions shown in About and acceptance records.
public enum AppBuildInfo {
    public static var marketingVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    public static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    public static var displayVersion: String {
        "\(marketingVersion) (\(buildNumber))"
    }
}
