import CompassData
import Foundation

enum FixtureLaunchPolicy {
    static var demoFixture: DemoSeedFixture? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_FIXTURE"), index + 1 < args.count else {
            return nil
        }
        guard args[index + 1].lowercased() == "demo" else { return nil }
        return try? DemoSeedFixture.load()
    }
}
