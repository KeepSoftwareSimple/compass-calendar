import Foundation
import Observation

@MainActor
@Observable
public final class StatusToastStore {
    public private(set) var message: String?
    public private(set) var toastId: String?

    private var dismissTask: Task<Void, Never>?

    public init() {}

    public func show(id: String, message: String, autoDismissSeconds: TimeInterval = 4) {
        dismissTask?.cancel()
        toastId = id
        self.message = message
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(autoDismissSeconds))
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
    }
}
