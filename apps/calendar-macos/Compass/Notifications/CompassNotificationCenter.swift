import AppKit
import CompassKit
import UserNotifications
import WebKit

@MainActor
protocol CompassNotificationDelivering: AnyObject {
    func deliverDeepLink(_ url: String)
    func syncNotificationPermission()
}

@MainActor
final class CompassNotificationCenter {
    static let shared = CompassNotificationCenter()

    private weak var deliverer: CompassNotificationDelivering?
    private var didRequestAuthorization = false
    private let userNotificationDelegate = CompassUserNotificationDelegate()

    private init() {
        UNUserNotificationCenter.current().delegate = userNotificationDelegate
    }

    func configure(deliverer: CompassNotificationDelivering) {
        self.deliverer = deliverer
    }

    func handle(_ message: BridgeMessage, webView: WKWebView) {
        switch message {
        case .requestNotificationPermission:
            Task { await requestAuthorization(webView: webView, promptIfNeeded: true) }
        case .getNotificationPermission:
            Task { await requestAuthorization(webView: webView, promptIfNeeded: false) }
        case let .showNotification(payload):
            Task { await post(payload, webView: webView) }
        default:
            break
        }
    }

    fileprivate func deliverEventTapFromNotification(eventId: String) {
        deliverEventTap(eventId: eventId)
    }

    private func permissionString(for settings: UNNotificationSettings) -> String {
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "default"
        @unknown default:
            return "default"
        }
    }

    private func deliverPermission(_ permission: String, to webView: WKWebView) {
        let encoded = permission.replacing("\\", with: "\\\\").replacing("'", with: "\\'")
        let script =
            "window.compassDesktop && window.compassDesktop.__deliverNotificationPermission('\(encoded)');"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func requestAuthorization(webView: WKWebView, promptIfNeeded: Bool) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        var permission = permissionString(for: settings)

        if permission == "default", promptIfNeeded, !didRequestAuthorization {
            didRequestAuthorization = true
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound])
                permission = granted ? "granted" : "denied"
            } catch {
                permission = "denied"
            }
        }

        deliverPermission(permission, to: webView)
    }

    private func post(_ payload: DesktopNotificationPayload, webView: WKWebView) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard permissionString(for: settings) == "granted" else {
            deliverPermission(permissionString(for: settings), to: webView)
            return
        }

        let content = UNMutableNotificationContent()
        content.title = payload.title
        if let body = payload.body, !body.isEmpty {
            content.body = body
        }
        if let tag = payload.tag, !tag.isEmpty {
            content.threadIdentifier = tag
        }
        do {
            content.userInfo = try DesktopNotificationPayloadCodec.userInfo(for: payload)
        } catch {
            return
        }

        let request = UNNotificationRequest(
            identifier: payload.tag ?? payload.eventId,
            content: content,
            trigger: nil)
        try? await center.add(request)
    }

    /// Parsed by `parseDesktopEventDeepLink` in packages/core/src/desktop.
    private func deliverEventTap(eventId: String) {
        NSApp.activate(ignoringOtherApps: true)
        deliverer?.deliverDeepLink("compass://event/\(eventId)")
    }
}

final class CompassUserNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let payload = try? DesktopNotificationPayloadCodec.decode(
                  from: response.notification.request.content.userInfo)
        else {
            return
        }

        let eventId = payload.eventId
        Task { @MainActor in
            CompassNotificationCenter.shared.deliverEventTapFromNotification(eventId: eventId)
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
