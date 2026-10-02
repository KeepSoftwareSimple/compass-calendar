import Foundation

/// Locates JSON and other files shipped in the CompassKit target resources.
public enum CompassKitResourceBundle {
    public static var resources: Bundle {
        #if SWIFT_PACKAGE
        return Bundle.module
        #else
        return Bundle(for: BundleAnchor.self)
        #endif
    }

    private final class BundleAnchor: NSObject {}
}
