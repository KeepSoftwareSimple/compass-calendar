import CompassData
import Foundation

enum NativeRootFactory {
    @MainActor
    static func makeModel() throws -> NativeCalendarRootModel {
        if let fixture = FixtureLaunchPolicy.demoFixture {
            let environment = try NativeCalendarEnvironment(fixture: fixture)
            return NativeCalendarRootModel(environment: environment, demoSeed: fixture)
        }
        let environment = try NativeCalendarEnvironment()
        return NativeCalendarRootModel(environment: environment)
    }
}
