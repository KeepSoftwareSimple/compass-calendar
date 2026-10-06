import Foundation

public struct DesktopNotificationPayload: Codable, Equatable, Sendable {
    public var title: String
    public var body: String?
    public var tag: String?
    public var eventId: String

    public init(title: String, body: String?, tag: String?, eventId: String) {
        self.title = title
        self.body = body
        self.tag = tag
        self.eventId = eventId
    }
}

public enum DesktopNotificationPayloadCodec {
    public static let userInfoKey = "compassNotification"

    public static func encode(_ payload: DesktopNotificationPayload) throws -> Data {
        try JSONEncoder().encode(payload)
    }

    public static func decode(from data: Data) throws -> DesktopNotificationPayload {
        try JSONDecoder().decode(DesktopNotificationPayload.self, from: data)
    }

    public static func decode(from userInfo: [AnyHashable: Any]) throws -> DesktopNotificationPayload {
        guard let raw = userInfo[userInfoKey] as? String,
              let data = raw.data(using: .utf8)
        else {
            throw DesktopNotificationPayloadError.invalidPayload
        }
        return try decode(from: data)
    }

    public static func userInfo(for payload: DesktopNotificationPayload) throws -> [String: String] {
        let data = try encode(payload)
        guard let encoded = String(data: data, encoding: .utf8) else {
            throw DesktopNotificationPayloadError.invalidPayload
        }
        return [userInfoKey: encoded]
    }
}

public enum DesktopNotificationPayloadError: Error, Equatable {
    case invalidPayload
}
