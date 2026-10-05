import Foundation

/// Queues recognized `compass://` links until the consumer is ready, then forwards
/// them to the app handler (native stores or hosted web view).
@MainActor
public struct DeepLinkRouter {
    private var inbox: DeepLinkInbox
    public var onDeliver: ((String) -> Void)?

    public init(inbox: DeepLinkInbox = DeepLinkInbox()) {
        self.inbox = inbox
    }

    public var pendingCount: Int {
        inbox.pending.count
    }

    @discardableResult
    public mutating func receive(urlString: String) -> DeepLinkInbox.ReceiveOutcome {
        let outcome = inbox.receive(urlString: urlString)
        if case let .deliverNow(url) = outcome {
            onDeliver?(url)
        }
        return outcome
    }

    /// Call after native stores bootstrap or the hosted web app finishes its first load.
    public mutating func markConsumerReady() {
        for url in inbox.markConsumerReady() {
            onDeliver?(url)
        }
    }
}
