// swift-tools-version:5.9
import PackageDescription

// Pure Swift logic for the Compass app: no AppKit, no WebKit, so XCTest runs
// without a window.
let package = Package(
    name: "CompassKit",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "CompassKit", targets: ["CompassKit"]),
    ],
    targets: [
        .target(name: "CompassKit"),
        .testTarget(
            name: "CompassKitTests",
            dependencies: ["CompassKit"]
        ),
    ]
)
