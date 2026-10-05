import XCTest
@testable import CompassKit

final class OnboardingSurfaceTests: XCTestCase {
    private func none() -> OnboardingSurfaceFlags {
        Dictionary(uniqueKeysWithValues: OnboardingSurfaceKind.allCases.map { ($0, false) })
    }

    private func only(_ kind: OnboardingSurfaceKind) -> OnboardingSurfaceFlags {
        var flags = none()
        flags[kind] = true
        return flags
    }

    func testSelectActiveSurfaceReturnsNilWhenNothingEligible() {
        XCTAssertNil(OnboardingSurfaceSelection.selectActiveSurface(none()))
    }

    func testSelectActiveSurfaceSelectsEachKindAlone() {
        for kind in OnboardingSurfaceKind.allCases {
            XCTAssertEqual(OnboardingSurfaceSelection.selectActiveSurface(only(kind)), kind)
        }
    }

    func testSelectActiveSurfacePrefersHigherPriority() {
        let cases = OnboardingSurfaceKind.allCases
        for index in 0 ..< cases.count - 1 {
            let higher = cases[index]
            let lower = cases[index + 1]
            var flags = none()
            flags[higher] = true
            flags[lower] = true
            XCTAssertEqual(OnboardingSurfaceSelection.selectActiveSurface(flags), higher)
        }
    }

    func testWelcomeModalEligibleForFirstTimeAnonymousWeekView() {
        let eligible = OnboardingGating.selectWelcomeModalSurfaceEligible(
            showCalendarOnboarding: true,
            authenticated: false,
            isFirstVisitOpen: false,
            guestMeetingSetupActive: false)
        XCTAssertTrue(eligible)
    }

    func testWelcomeModalHiddenOnLifeViewViaShowCalendarOnboarding() {
        let input = OnboardingGating.ActiveSurfaceInput(
            gateStatus: nil,
            isCheckoutCelebrating: false,
            showCalendarOnboarding: false,
            authenticated: false,
            isWelcomeFirstVisitOpen: false,
            isWelcomeGuideOpen: false,
            guestMeetingSetupActive: false,
            shortcutShowcaseActive: false,
            connectCalendarEligible: false,
            firstEventEligible: true,
            pointerHintVisible: true,
            isLifeView: true)
        XCTAssertNil(OnboardingGating.selectActiveSurface(input))
    }

    func testBillingGateBlocksWelcomeModal() {
        var input = OnboardingGating.ActiveSurfaceInput(
            gateStatus: .awaitingCheckout,
            isCheckoutCelebrating: false,
            showCalendarOnboarding: true,
            authenticated: false,
            isWelcomeFirstVisitOpen: false,
            isWelcomeGuideOpen: false,
            guestMeetingSetupActive: false,
            shortcutShowcaseActive: false,
            connectCalendarEligible: true,
            firstEventEligible: true,
            pointerHintVisible: true,
            isLifeView: false)
        XCTAssertEqual(OnboardingGating.selectActiveSurface(input), .billingGate)
        input.gateStatus = nil
        input.authenticated = false
        XCTAssertEqual(OnboardingGating.selectActiveSurface(input), .welcomeModal)
    }
}
