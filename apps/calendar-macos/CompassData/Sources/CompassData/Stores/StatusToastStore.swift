import Foundation
import Observation

@MainActor
@Observable
public final class StatusToastStore {
    public private(set) var message: String?
    public private(set) var toastId: String?

    /// Fires when toast visibility changes (AppKit mirror for XCUITest).
    public var onVisibilityChanged: ((Bool) -> Void)?

    private var dismissTask: Task<Void, Never>?

    public init() {}

    public func show(id: String, message: String, autoDismissSeconds: TimeInterval = 4) {
        dismissTask?.cancel()
        toastId = id
        self.message = message
        onVisibilityChanged?(true)
        let dismissAfter =
            id == "recurrence-scope" ? 0 : autoDismissSeconds
        guard dismissAfter > 0 else { return }
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(dismissAfter))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if self?.toastId == id {
                    self?.clear()
                }
            }
        }
    }

    public func clear() {
        dismissTask?.cancel()
        dismissTask = nil
        message = nil
        toastId = nil
        onVisibilityChanged?(false)
    }
}
