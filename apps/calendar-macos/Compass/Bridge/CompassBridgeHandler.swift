import AppKit
import CompassKit
import WebKit

/// Decodes bridge messages from the web view and dispatches them to native handlers.
final class CompassBridgeHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    weak var quickAddRouter: DesktopQuickAddRouting?
    var onAppearanceChange: ((String) -> Void)?
    var onLaunchAtLoginChange: ((Bool) -> Void)?
    var launchAtLoginStatus: (() -> Bool)?
    var onRestartToUpdate: (() -> Void)?

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
        case let .setAgenda(items):
            Task { @MainActor in
                CompassAgendaController.shared.updateAgenda(items)
            }
        case .restartToUpdate:
            Task { @MainActor in
                self.onRestartToUpdate?()
            }
        case .requestNotificationPermission, .getNotificationPermission, .showNotification:
            guard let webView else { return }
            Task { @MainActor in
                CompassNotificationCenter.shared.handle(bridgeMessage, webView: webView)
            }
        case let .setQuickAddHotkey(shortcut):
            Task { @MainActor in
                self.quickAddRouter?.setQuickAddHotkey(shortcut)
            }
        case .dismissQuickAddPanel:
            Task { @MainActor in
                self.quickAddRouter?.dismissQuickAddPanel()
            }
        case let .setAppearance(theme):
            Task { @MainActor in
                self.onAppearanceChange?(theme)
            }
        case let .setLaunchAtLogin(enabled):
            Task { @MainActor in
                self.onLaunchAtLoginChange?(enabled)
            }
        case .getLaunchAtLogin:
            guard let webView else { return }
            let enabled = launchAtLoginStatus?() ?? false
            webView.evaluateJavaScript(
                BridgeScript.deliverLaunchAtLoginJavaScript(enabled: enabled))
        }
    }
}
