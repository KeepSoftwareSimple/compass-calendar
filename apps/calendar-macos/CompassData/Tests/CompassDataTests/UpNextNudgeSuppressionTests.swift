import CompassData
import XCTest

@MainActor
final class BottomNoticeSuppressionTests: XCTestCase {
    func testSuppressBottomNoticesWhenAuthModalPresented() async throws {
        let environment = try NativeCalendarEnvironment(
            inMemoryDatabase: true,
            sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(environment: environment)
        await model.start()
        model.authStore.openModal(.login)
        XCTAssertTrue(model.suppressBottomNotices)
    }
}
