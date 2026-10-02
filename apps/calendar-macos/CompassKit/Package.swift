// swift-tools-version: 6.0
import PackageDescription

// Pure Swift logic for the Compass app: no AppKit, no WebKit, so XCTest runs
// without a window.
let package = Package(
    name: "CompassKit",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "CompassKit", targets: ["CompassKit"]),
    ],
    targets: [
        .target(
            name: "CompassKit",
            resources: [
                .copy("Resources"),
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
        .testTarget(
            name: "CompassKitTests",
            dependencies: ["CompassKit"],
            resources: [
                .copy("Fixtures"),
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
