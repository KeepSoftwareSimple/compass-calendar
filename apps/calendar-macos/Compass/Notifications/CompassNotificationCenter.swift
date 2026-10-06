import AppKit
import CompassKit
import UserNotifications

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

    func requestAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if permissionString(for: settings) == "default", !didRequestAuthorization {
            didRequestAuthorization = true
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
    }

    @discardableResult
    func showNative(_ payload: DesktopNotificationPayload) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard permissionString(for: settings) == "granted" else {
            return false
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
            return false
        }

        let request = UNNotificationRequest(
            identifier: payload.tag ?? payload.eventId,
            content: content,
            trigger: nil)
        do {
            try await center.add(request)
            return true
        } catch {
            return false
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
