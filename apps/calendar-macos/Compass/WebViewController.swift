import AppKit
import CompassKit
import WebKit

/// Hosts the web app. Navigations off the app origin and every
/// `window.open` go to the default browser.
final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate,
    CompassNotificationDelivering
{
    private let appURL: URL
    private var webView: WKWebView!
    private let bridgeHandler = CompassBridgeHandler()
    private var loadState = WebLoadStateMachine()
    private var resilience: WebViewResilience?

    init(appURL: URL) {
        self.appURL = appURL
        super.init(nibName: nil, bundle: nil)
        bridgeHandler.webViewController = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    deinit {
        resilience?.stop()
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
        loadAppURL()
        resilience = WebViewResilience(
            onNetworkReachable: { [weak self] in
                self?.handleNetworkBecameReachable()
            },
            onSystemResume: { [weak self] in
                self?.handleSystemResume()
            })
        resilience?.start()
    }

    func deliverDeepLink(_ url: String) {
        view.window?.makeKeyAndOrderFront(nil)
        webView.evaluateJavaScript(BridgeScript.deliverDeepLinkJavaScript(url: url))
    }

    func syncNotificationPermission() {
        guard webView != nil else { return }
        CompassNotificationCenter.shared.handle(.getNotificationPermission, webView: webView)
    }

    func loadAppURL() {
        webView.load(URLRequest(url: appURL))
    }

    func deliverLaunchAtLogin(_ enabled: Bool) {
        webView.evaluateJavaScript(
            BridgeScript.deliverLaunchAtLoginJavaScript(enabled: enabled),
            completionHandler: nil)
    }

    func deliverResumeToWebApp() {
        webView.evaluateJavaScript(BridgeScript.deliverResumeJavaScript, completionHandler: nil)
    }

    private func showOfflinePage() {
        guard let offlineURL = Bundle.main.url(forResource: "offline", withExtension: "html") else {
            return
        }
        webView.loadFileURL(offlineURL, allowingReadAccessTo: offlineURL.deletingLastPathComponent())
    }

    private func applyLoadActions(_ actions: [WebLoadAction]) {
        for action in actions {
            switch action {
            case .showOfflinePage:
                showOfflinePage()
            case .loadAppURL:
                loadAppURL()
            }
        }
    }

    private func handleMainFrameLoadFailure() {
        applyLoadActions(loadState.handle(.appLoadFailed))
    }

    private func handleMainFrameLoadSuccess(for url: URL?) {
        guard let url else { return }
        if url.isFileURL {
            return
        }
        guard AppOrigin.isSameOrigin(url, appURL) else { return }
        let wasOffline = loadState.presentation == .offline
        applyLoadActions(loadState.handle(.appLoadSucceeded))
        if wasOffline {
            deliverResumeToWebApp()
        }
    }

    private func handleOfflineRetryRequest() {
        applyLoadActions(loadState.handle(.userRequestedRetry))
    }

    private func handleNetworkBecameReachable() {
        if loadState.presentation == .offline {
            applyLoadActions(loadState.handle(.networkBecameReachable))
            return
        }
        if loadState.presentation == .app {
            deliverResumeToWebApp()
        }
    }

    private func handleSystemResume() {
        if loadState.presentation == .offline {
            applyLoadActions(loadState.handle(.networkBecameReachable))
            return
        }
        deliverResumeToWebApp()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        handleMainFrameLoadSuccess(for: webView.url)
        publishBridgeVersionFromPage(webView: webView, attempt: 0)
        syncNotificationPermission()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleMainFrameLoadFailure()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        handleMainFrameLoadFailure()
    }

    private func publishBridgeVersionFromPage(webView: WKWebView, attempt: Int) {
        webView.evaluateJavaScript(BridgeScript.readBridgeVersionJavaScript) {
            [weak self] result, _ in
            Task { @MainActor in
                if let version = result as? String, !version.isEmpty {
                    CompassBridgeAccessibility.publishBridgeVersion(
                        version,
                        on: self?.view.window)
                    return
                }
                guard attempt < 8 else { return }
                try? await Task.sleep(for: .seconds(2))
                self?.publishBridgeVersionFromPage(webView: webView, attempt: attempt + 1)
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
        if url == OfflineRetryLink.url {
            handleOfflineRetryRequest()
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
