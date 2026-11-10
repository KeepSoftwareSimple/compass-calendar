import Foundation

/// Wide viewport XCTest sequencing: publish a window geometry mirror before the tree
/// grows, then open the event form only after a stable layout pass.
public enum WideViewportLaunchCoordination {
    public static let stableGeometryPublishedNotification =
        Notification.Name("CompassWideViewportStableGeometryPublished")

    private static var stableGeometryPublishedForLaunch = false

    public static var stableGeometryPublished: Bool {
        stableGeometryPublishedForLaunch
    }

    public static func noteStableGeometryPublished() {
        guard UITestLaunchPolicy.meetingLinkWideViewport else { return }
        guard !stableGeometryPublishedForLaunch else { return }
        stableGeometryPublishedForLaunch = true
        WideViewportUITestTrace.record("stable_geometry_published")
        NotificationCenter.default.post(name: stableGeometryPublishedNotification, object: nil)
    }

    public static func resetForTesting() {
        stableGeometryPublishedForLaunch = false
    }
}
