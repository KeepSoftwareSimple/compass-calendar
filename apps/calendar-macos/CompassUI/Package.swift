// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CompassUI",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "CompassUI", targets: ["CompassUI"]),
    ],
    dependencies: [
        .package(path: "../CompassKit"),
        .package(path: "../CompassData"),
    ],
    targets: [
        .target(
            name: "CompassUI",
            dependencies: ["CompassKit", "CompassData"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
