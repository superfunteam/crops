// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Crops",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "Crops", targets: ["Crops"]), .executable(name: "CropsCheck", targets: ["CropsCheck"])],
    targets: [
        .target(name: "CropsCore"),
        .executableTarget(name: "Crops", dependencies: ["CropsCore"]),
        .executableTarget(name: "CropsCheck", dependencies: ["CropsCore"]),
        .executableTarget(name: "CropsCoreTests", dependencies: ["CropsCore"], path: "Tests/CropsCoreTests")
    ]
)
