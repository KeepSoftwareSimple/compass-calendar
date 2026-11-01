import XCTest
@testable import CompassKit

final class PostHogIdentityControllerTests: XCTestCase {
    func testAnonymousDistinctIdIsStableAcrossCapturesAndRelaunch() {
        let defaults = PostHogAnalyticsDefaultsBox()
        var controller = PostHogIdentityController(
            defaults: defaults,
            generateDistinctId: { "anon-generated" })

        XCTAssertEqual(controller.distinctIdForCapture(), "anon-generated")
        XCTAssertEqual(controller.distinctIdForCapture(), "anon-generated")

        var relaunched = PostHogIdentityController(defaults: defaults)
        XCTAssertEqual(relaunched.distinctIdForCapture(), "anon-generated")
    }

    func testSignedInDistinctIdMatchesWebUserId() {
        let defaults = PostHogAnalyticsDefaultsBox()
        defaults.set("anon-before-sign-in", forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId)
        var controller = PostHogIdentityController(defaults: defaults)

        let aliasEvent = controller.identify(userId: "user-web-123")
        XCTAssertEqual(controller.distinctIdForCapture(), "user-web-123")
        XCTAssertEqual(
            aliasEvent,
            .alias(previousAnonymousId: "anon-before-sign-in", userId: "user-web-123"))
    }

    func testIdentifyDoesNotAliasWhenAnonymousIdAlreadyMatchesUserId() {
        let defaults = PostHogAnalyticsDefaultsBox()
        defaults.set("user-web-123", forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId)
        var controller = PostHogIdentityController(defaults: defaults)

        XCTAssertNil(controller.identify(userId: "user-web-123"))
        XCTAssertEqual(controller.distinctIdForCapture(), "user-web-123")
    }

    func testResetSignedOutIdentityMintsFreshAnonymousId() {
        let defaults = PostHogAnalyticsDefaultsBox()
        defaults.set("anon-old", forKey: PostHogAnalyticsStorageKeys.anonymousDistinctId)
        var controller = PostHogIdentityController(
            defaults: defaults,
            generateDistinctId: { "anon-fresh" })
        _ = controller.identify(userId: "user-web-123")

        let fresh = controller.resetSignedOutIdentity()
        XCTAssertEqual(fresh, "anon-fresh")
        XCTAssertEqual(controller.distinctIdForCapture(), "anon-fresh")
    }

    func testAliasCaptureUsesPostHogCreateAliasShape() {
        let controller = PostHogIdentityController()
        let capture = controller.makeAliasCapture(
            previousAnonymousId: "anon-1",
            userId: "user-1")
        XCTAssertEqual(capture.event, PostHogIdentityController.createAliasEventName)
        XCTAssertEqual(capture.distinctId, "user-1")
        XCTAssertEqual(capture.properties[PostHogIdentityController.aliasPropertyKey], .string("anon-1"))
    }
}
