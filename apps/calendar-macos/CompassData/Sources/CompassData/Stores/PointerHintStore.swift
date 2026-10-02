import CompassKit
import Foundation

@MainActor
@Observable
public final class PointerHintStore {
    public private(set) var isVisible = false
    public private(set) var attempt: PointerHintAttempt?

    private var shownIntents: Set<PointerClickTarget> = []
    private var sessionCount = 0
    private let sessionCap = 3

    public init() {}

    public func pulse(target: PointerClickTarget, registry: ShortcutRegistry) {
        guard sessionCount < sessionCap else { return }
        guard !shownIntents.contains(target) else { return }
        guard let attempt = PointerHintMessaging.attempt(for: target, registry: registry) else { return }
        shownIntents.insert(target)
        sessionCount += 1
        self.attempt = attempt
        isVisible = true
    }

    public func hide() {
        isVisible = false
    }
}
