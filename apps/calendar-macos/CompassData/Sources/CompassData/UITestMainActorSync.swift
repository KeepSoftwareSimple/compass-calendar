import Foundation

/// Runs async MainActor work while the caller blocks on the main run loop.
///
/// Scheduling `Task { @MainActor in … }` directly from a MainActor call site that then
/// spins `RunLoop` deadlocks: the task cannot start until the caller returns. UI-test
/// keyboard handlers use this helper so `saveDraft()` and undo replay can finish before
/// XCUITest continues.
enum UITestMainActorSync {
    static func runAndWait(
        timeout: TimeInterval = 10,
        _ work: @MainActor @escaping () async -> Void
    ) {
        final class DoneFlag: @unchecked Sendable {
            var value = false
        }
        let done = DoneFlag()
        DispatchQueue.main.async {
            Task { @MainActor in
                await work()
                done.value = true
            }
        }
        let deadline = Date().addingTimeInterval(timeout)
        while !done.value, Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
            RunLoop.main.run(mode: .eventTracking, before: Date().addingTimeInterval(0.05))
        }
    }
}
