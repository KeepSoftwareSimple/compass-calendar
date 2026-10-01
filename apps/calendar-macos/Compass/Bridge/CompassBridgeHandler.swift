import AppKit
import CompassKit
import WebKit

/// Decodes bridge messages from the web view and dispatches them to native handlers.
final class CompassBridgeHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "compass" else { return }

        let body: Any = message.body
        let data: Data
        if let dictionary = body as? [String: Any] {
            guard JSONSerialization.isValidJSONObject(dictionary),
                  let encoded = try? JSONSerialization.data(withJSONObject: dictionary)
            else { return }
            data = encoded
        } else if let string = body as? String, let encoded = string.data(using: .utf8) {
            data = encoded
        } else {
            return
        }

        guard let bridgeMessage = try? BridgeMessageCodec.decode(from: data) else { return }

        switch bridgeMessage {
        case let .openExternal(url):
            guard let externalURL = URL(string: url) else { return }
            NSWorkspace.shared.open(externalURL)
        case .setAgenda:
            break
        case .restartToUpdate:
            break
        case .requestNotificationPermission:
            Task { @MainActor in
                CompassNotificationService.shared.requestAuthorization { granted in
                    guard let webView = self.webView else { return }
                    webView.evaluateJavaScript(
                        BridgeScript.deliverNotificationPermissionJavaScript(granted: granted))
                }
            }
        case let .showNotification(payload):
            Task { @MainActor in
                CompassNotificationService.shared.show(payload)
            }
        }
    }
}
