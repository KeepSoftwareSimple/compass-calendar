import CompassKit
import XCTest

extension XCUIApplication {
    /// A Compass launch with `-COMPASS_UI_TEST`, which attaches the AppKit
    /// accessibility probes these tests read. Fixture startup stays independent
    /// of the live service. Production launches omit these arguments.
    static func compassUITest(lifeViewIntroSeen: Bool = true) -> XCUIApplication {
        let app = CompassUITestApplication()
        app.launchArguments += ["-COMPASS_UI_TEST", "-COMPASS_APP_URL", "https://compass.invalid"]
        // Existing feature flows start after onboarding; intro tests opt into a fresh visit.
        app.launchArguments += [
            "-\(OnboardingStorageKeys.hasSeenLifeViewIntro)", lifeViewIntroSeen ? "true" : "false",
        ]
        return app
    }
}

/// Bring Compass forward before XCTest computes hit points. Otherwise its
/// implicit interruption handler may query another app covering the target.
private final class CompassUITestApplication: XCUIApplication {
    override func launch() {
        super.launch()
        activate()
    }
}
