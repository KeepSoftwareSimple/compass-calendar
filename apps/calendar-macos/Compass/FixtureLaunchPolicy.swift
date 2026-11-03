import CompassData
import Foundation

enum FixtureLaunchPolicy {
    static var demoFixture: DemoSeedFixture? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-COMPASS_FIXTURE"), index + 1 < args.count else {
            return nil
        }
        switch args[index + 1].lowercased() {
        case "demo": return try? DemoSeedFixture.load()
        case "demo-attendee": return try? DemoSeedFixture.load().attendeeVariant()
        default: return nil
        }
    }
}
