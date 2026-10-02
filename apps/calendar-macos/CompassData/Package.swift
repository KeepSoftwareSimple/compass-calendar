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
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
    ],
    targets: [
        .target(
            name: "CompassData",
            dependencies: [
                "CompassKit",
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
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
