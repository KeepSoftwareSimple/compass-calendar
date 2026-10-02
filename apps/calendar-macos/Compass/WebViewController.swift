import AppKit
import CompassKit
import Network
import WebKit

/// Hosts the web app. Navigations off the app origin and every
/// `window.open` go to the default browser.
final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate,
    CompassNotificationDelivering, CompassAgendaDeepLinkDelivering
{
    private(set) var appURL: URL
    private let injectQuickAddBridge: Bool
    /// Host window for accessibility probes (matches AppDelegate.window).
    weak var accessibilityHostWindow: NSWindow?
    private var webView: WKWebView!
    private let bridgeHandler = CompassBridgeHandler()
    private let offlineRetryHandler = OfflineRetryMessageHandler()
    private var loadState = WebLoadStateMachine()
    private var deepLinkInbox = DeepLinkInbox()
    private var pathMonitor: NWPathMonitor?
    private var offlinePageURL: URL? {
        Bundle.main.url(forResource: "offline", withExtension: "html")
    }

    func configureQuickAddRouter(_ router: DesktopQuickAddRouting) {
        bridgeHandler.quickAddRouter = router
    }

    init(appURL: URL, injectQuickAddBridge: Bool = false) {
        self.appURL = appURL
        self.injectQuickAddBridge = injectQuickAddBridge
        super.init(nibName: nil, bundle: nil)
    }

    @MainActor
    func dispatchShortcut(_ shortcut: MainMenuShortcutName) {
        let probeWindow = accessibilityHostWindow ?? view.window
        CompassBridgeAccessibility.publishLastDispatchedShortcut(
            shortcut.rawValue,
            on: probeWindow)
        webView?.evaluateJavaScript(BridgeScript.dispatchShortcutJavaScript(name: shortcut.rawValue)) {
            [weak self] result, _ in
            Task { @MainActor in
                guard (result as? Bool) == true else { return }
                let window = self?.accessibilityHostWindow ?? self?.view.window
                CompassBridgeAccessibility.publishLastDispatchedShortcut(
                    shortcut.rawValue,
                    on: window)
            }
        }
    }

    var onRestartToUpdate: (() -> Void)? {
        get { bridgeHandler.onRestartToUpdate }
        set { bridgeHandler.onRestartToUpdate = newValue }
    }

    func deliverUpdateReady(version: String) {
        webView?.evaluateJavaScript(BridgeScript.deliverUpdateReadyJavaScript(version: version))
    }

    func reloadAppHost() {
        let resolved = AppOrigin.resolve(
            override: UserDefaults.standard.string(forKey: "COMPASS_APP_URL"),
            infoValue: Bundle.main.object(forInfoDictionaryKey: "COMPASS_APP_URL") as? String)
        guard resolved != appURL else { return }
        appURL = resolved
        reinstallBridgeUserScripts()
        loadAppURL()
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
        contentController.add(offlineRetryHandler, name: "offlineRetry")
        offlineRetryHandler.onRetry = { [weak self] in
            Task { @MainActor in
                self?.retryAppLoadFromOffline()
            }
        }

        let origin = appURL.originString
        let quickAddHotkey = QuickAddHotKeyStorage.load().displayString
        let bridgeSource = BridgeScript.userScriptSource(
            appOrigin: origin,
            quickAddHotkeyDisplay: quickAddHotkey,
            includeQuickAddControls: injectQuickAddBridge)
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
        bridgeHandler.onAppearanceChange = { theme in
            DesktopNativeServices.applyAppearance(theme: theme)
        }
        bridgeHandler.onLaunchAtLoginChange = { enabled in
            try? DesktopNativeServices.setLaunchAtLogin(enabled)
        }
        bridgeHandler.launchAtLoginStatus = {
            DesktopNativeServices.launchAtLoginEnabled()
        }
        bridgeHandler.onDeepLinkNavigationReport = { [weak self] path in
            Task { @MainActor in
                let window = self?.accessibilityHostWindow ?? self?.view.window
                CompassBridgeAccessibility.publishDeepLinkNavigationPath(path, on: window)
            }
        }
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
        startNetworkAndWakeMonitoring()
        loadAppURL()
    }

    deinit {
        pathMonitor?.cancel()
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    private func startNetworkAndWakeMonitoring() {
        let monitor = NWPathMonitor()
        pathMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.handleNetworkPathUpdate(path.status == .satisfied)
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.compasscalendar.desktop.network"))

        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(handleSystemWake),
            name: NSWorkspace.didWakeNotification,
            object: nil)
    }

    @objc private func handleSystemWake() {
        deliverResumeToWebApp()
        if loadState.phase == .showingOffline, loadState.networkSatisfied {
            loadAppURL()
        }
    }

    private func handleNetworkPathUpdate(_ satisfied: Bool) {
        let wasSatisfied = loadState.networkSatisfied
        loadState.setNetworkSatisfied(satisfied)
        guard satisfied, !wasSatisfied else { return }
        deliverResumeToWebApp()
        if loadState.phase == .showingOffline {
            loadAppURL()
        }
    }

    func deliverResumeToWebApp() {
        webView?.evaluateJavaScript(BridgeScript.deliverResumeJavaScript)
    }

    private func loadAppURL() {
        loadState.appLoadStarted()
        webView.load(URLRequest(url: appURL))
    }

    private func showOfflinePage() {
        guard let offlinePageURL else { return }
        loadState.appLoadFailed()
        webView.loadFileURL(offlinePageURL, allowingReadAccessTo: offlinePageURL.deletingLastPathComponent())
    }

    private func retryAppLoadFromOffline() {
        loadState.retryRequested()
        guard loadState.phase == .loadingApp else { return }
        loadAppURL()
    }

    func receiveDeepLink(_ url: URL) {
        receiveDeepLink(urlString: url.absoluteString)
    }

    func receiveDeepLink(urlString: String) {
        switch deepLinkInbox.receive(urlString: urlString) {
        case .ignored, .queued:
            break
        case let .deliverNow(url):
            deliverDeepLink(url)
        }
    }

    func deliverDeepLink(_ url: String) {
        view.window?.makeKeyAndOrderFront(nil)
        let probeWindow = accessibilityHostWindow ?? view.window
        if let path = DesktopDeepLinkParser.navigationPath(for: url) {
            CompassBridgeAccessibility.publishDeepLinkNavigationPath(path, on: probeWindow)
        }
        webView.evaluateJavaScript(BridgeScript.deliverDeepLinkJavaScript(url: url))
    }

    private func flushQueuedDeepLinks() {
        for url in deepLinkInbox.markWebViewReady() {
            deliverDeepLink(url)
        }
    }

    func syncNotificationPermission() {
        guard let webView else { return }
        CompassNotificationCenter.shared.handle(.getNotificationPermission, webView: webView)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url else { return }
        if url.isFileURL, url.lastPathComponent == "offline.html" {
            return
        }
        if AppOrigin.decide(url, isMainFrame: true, appURL: appURL) == .allow {
            loadState.appLoadSucceeded()
            flushQueuedDeepLinks()
            publishBridgeVersionFromPage(webView: webView, attempt: 0)
            syncNotificationPermission()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleMainFrameLoadFailure(webView: webView, error: error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        handleMainFrameLoadFailure(webView: webView, error: error)
    }

    private func handleMainFrameLoadFailure(webView: WKWebView, error: Error) {
        guard webView.url == nil || webView.url?.isFileURL != true else { return }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled {
            return
        }
        showOfflinePage()
    }

    private func publishBridgeVersionFromPage(webView: WKWebView, attempt: Int) {
        webView.evaluateJavaScript(BridgeScript.readBridgeVersionJavaScript) {
            [weak self] result, _ in
            Task { @MainActor in
                guard let self else { return }
                if let version = result as? String,
                   !version.isEmpty,
                   let window = self.accessibilityHostWindow ?? self.view.window
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
