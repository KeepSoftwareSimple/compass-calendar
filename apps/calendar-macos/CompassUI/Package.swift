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
    ],
    targets: [
        .target(
            name: "CompassUI",
            dependencies: ["CompassKit"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
