import WebKit

/// Receives Retry taps from bundled `offline.html` (no app-origin bridge).
final class OfflineRetryMessageHandler: NSObject, WKScriptMessageHandler {
    var onRetry: (() -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "offlineRetry" else { return }
        onRetry?()
    }
}
