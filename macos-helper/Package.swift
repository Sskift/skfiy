// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "skfiy-helper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "skfiy-helper", targets: ["SkfiyHelper"])
    ],
    targets: [
        .executableTarget(
            name: "SkfiyHelper",
            path: "Sources/skfiy-helper",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("CoreGraphics")
            ]
        )
    ]
)
