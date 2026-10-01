import AppKit
import CompassKit
import WebKit

/// Hosts the web app. Navigations off the app origin and every
/// `window.open` go to the default browser.
final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate,
    CompassNotificationDelivering, CompassAgendaDeepLinkDelivering
{
    private(set) var appURL: URL
    private var webView: WKWebView!
    private let bridgeHandler = CompassBridgeHandler()

    init(appURL: URL) {
        self.appURL = appURL
        super.init(nibName: nil, bundle: nil)
    }

    func dispatchShortcut(_ shortcut: MainMenuShortcutName) {
        CompassBridgeAccessibility.publishLastDispatchedShortcut(
            shortcut.rawValue,
            on: view.window)
        webView?.evaluateJavaScript(BridgeScript.dispatchShortcutJavaScript(name: shortcut.rawValue)) {
            [weak self] result, _ in
            Task { @MainActor in
                guard (result as? Bool) == true else { return }
                CompassBridgeAccessibility.publishLastDispatchedShortcut(
                    shortcut.rawValue,
                    on: self?.view.window)
            }
        }
    }

    func reloadAppHost() {
        let resolved = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)
        guard resolved != appURL else { return }
        appURL = resolved
        reinstallBridgeUserScripts()
        webView.load(URLRequest(url: appURL))
    }

    private func reinstallBridgeUserScripts() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        let bridgeSource = BridgeScript.userScriptSource(appOrigin: appURL.originString)
        controller.addUserScript(
            WKUserScript(
                source: bridgeSource,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true))
        controller.addUserScript(
            WKUserScript(
                source: bridgeSource,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let contentController = WKUserContentController()
        contentController.add(bridgeHandler, name: "compass")

        let origin = appURL.originString
        let bridgeSource = BridgeScript.userScriptSource(appOrigin: origin)
        contentController.addUserScript(
            WKUserScript(
                source: bridgeSource,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true))
        // At document start `location.origin` can still be empty on the first
        // navigation; document end matches the configured app origin reliably.
        contentController.addUserScript(
            WKUserScript(
                source: bridgeSource,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true))
        configuration.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: configuration)
        bridgeHandler.webView = webView
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        #endif
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        CompassNotificationCenter.shared.configure(deliverer: self)
        CompassAgendaController.shared.configure(deepLinkDeliverer: self)
        webView.load(URLRequest(url: appURL))
    }

    func deliverDeepLink(_ url: String) {
        view.window?.makeKeyAndOrderFront(nil)
        webView.evaluateJavaScript(BridgeScript.deliverDeepLinkJavaScript(url: url))
    }

    func syncNotificationPermission() {
        guard let webView else { return }
        CompassNotificationCenter.shared.handle(.getNotificationPermission, webView: webView)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        publishBridgeVersionFromPage(webView: webView, attempt: 0)
        syncNotificationPermission()
    }

    private func publishBridgeVersionFromPage(webView: WKWebView, attempt: Int) {
        webView.evaluateJavaScript(BridgeScript.readBridgeVersionJavaScript) {
            [weak self] result, _ in
            Task { @MainActor in
                guard let self else { return }
                if let version = result as? String,
                   !version.isEmpty,
                   let window = self.view.window
                {
                    CompassBridgeAccessibility.publishBridgeVersion(version, on: window)
                    return
                }
                guard attempt < 12 else { return }
                let delaySeconds = attempt < 4 ? 0.05 : 2.0
                try? await Task.sleep(for: .seconds(delaySeconds))
                self.publishBridgeVersionFromPage(webView: webView, attempt: attempt + 1)
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch AppOrigin.decide(url, isMainFrame: isMainFrame, appURL: appURL) {
        case .allow:
            decisionHandler(.allow)
        case .openExternally:
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

private extension URL {
    var originString: String {
        guard let host else { return "" }
        if let port {
            return "\(scheme ?? "https")://\(host):\(port)"
        }
        return "\(scheme ?? "https")://\(host)"
    }
}
