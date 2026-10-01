import AppKit
import CompassKit
import UserNotifications

/// Posts native notifications and relays taps into compass:// event deep links.
@MainActor
final class CompassNotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = CompassNotificationService()

    var deliverDeepLink: ((String) -> Void)?

    private var didRequestAuthorization = false
    private var authorizationGranted = false

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        if didRequestAuthorization {
            completion(authorizationGranted)
            return
        }
        didRequestAuthorization = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) {
            [weak self] granted, _ in
            Task { @MainActor in
                self?.authorizationGranted = granted
                completion(granted)
            }
        }
    }

    func show(_ payload: DesktopShowNotificationPayload) {
        let content = UNMutableNotificationContent()
        content.title = payload.title
        if let body = payload.body, !body.isEmpty {
            content.body = body
        }
        content.userInfo = ["eventId": payload.eventId]
        if let tag = payload.tag, !tag.isEmpty {
            content.threadIdentifier = tag
        }
        let identifier = payload.tag ?? payload.eventId
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let eventId = response.notification.request.content.userInfo["eventId"] as? String
        await MainActor.run {
            NSApp.activate(ignoringOtherApps: true)
            if let eventId, !eventId.isEmpty {
                deliverDeepLink?(buildDesktopEventDeepLink(eventId: eventId))
            }
        }
    }
}

private func buildDesktopEventDeepLink(eventId: String) -> String {
    let encoded =
        eventId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? eventId
    return "compass://event/\(encoded)"
}
