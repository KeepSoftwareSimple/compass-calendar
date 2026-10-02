// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CompassData",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "CompassData", targets: ["CompassData"]),
    ],
    dependencies: [
        .package(path: "../CompassKit"),
    ],
    targets: [
        .target(
            name: "CompassData",
            dependencies: ["CompassKit"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
        .testTarget(
            name: "CompassDataTests",
            dependencies: ["CompassData", "CompassKit"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
