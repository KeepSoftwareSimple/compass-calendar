import CoreGraphics

/// macOS unified title bar: calendar nav lives beside the traffic lights.
/// Keep `mainContentTopInset` in sync with `.github/scripts/compose-desktop-parity-shots.py`.
public enum MacTitleBarChromeMetrics {
    /// Leading inset so controls sit just right of the traffic-light cluster.
    public static let trafficLightLeadingInset: CGFloat = 78
    /// In-window band height for title-bar controls (nav, title, sidebar toggle).
    public static let contentBandHeight: CGFloat = 28
    /// Padding before demo banner / grid content below the unified title bar.
    public static var mainContentTopInset: CGFloat { contentBandHeight + 16 }
    /// Marketing / Tyler reference: title bar plus a slice of grid chrome below.
    public static let referenceCaptureHeight: CGFloat = 120
}
