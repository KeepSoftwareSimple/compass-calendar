import Foundation

public struct DesktopAgendaItem: Codable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var startsAt: String
    public var endsAt: String

    public init(id: String, title: String, startsAt: String, endsAt: String) {
        self.id = id
        self.title = title
        self.startsAt = startsAt
        self.endsAt = endsAt
    }
}

public enum BridgeMessage: Equatable, Sendable {
    case openExternal(url: String)
    case setAgenda(items: [DesktopAgendaItem])
    case restartToUpdate
    case requestNotificationPermission
    case getNotificationPermission
    case showNotification(payload: DesktopNotificationPayload)
    case setQuickAddHotkey(shortcut: String)
    case dismissQuickAddPanel
    case setAppearance(theme: String)
    case setLaunchAtLogin(enabled: Bool)
    case getLaunchAtLogin
    case reportDeepLinkNavigation(path: String)
}

public enum BridgeMessageCodec {
    public static func decode(from data: Data) throws -> BridgeMessage {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = object as? [String: Any],
              let method = dictionary["method"] as? String
        else {
            throw BridgeMessageError.invalidPayload
        }

        switch method {
        case "openExternal":
            guard let url = dictionary["url"] as? String else {
                throw BridgeMessageError.invalidPayload
            }
            return .openExternal(url: url)
        case "setAgenda":
            guard let rawItems = dictionary["items"] as? [[String: Any]] else {
                throw BridgeMessageError.invalidPayload
            }
            let items = try rawItems.map { item -> DesktopAgendaItem in
                guard let id = item["id"] as? String,
                      let title = item["title"] as? String,
                      let startsAt = item["startsAt"] as? String,
                      let endsAt = item["endsAt"] as? String
                else {
                    throw BridgeMessageError.invalidPayload
                }
                return DesktopAgendaItem(
                    id: id,
                    title: title,
                    startsAt: startsAt,
                    endsAt: endsAt)
            }
            return .setAgenda(items: items)
        case "restartToUpdate":
            return .restartToUpdate
        case "requestNotificationPermission":
            return .requestNotificationPermission
        case "getNotificationPermission":
            return .getNotificationPermission
        case "showNotification":
            guard let title = dictionary["title"] as? String,
                  let eventId = dictionary["eventId"] as? String
            else {
                throw BridgeMessageError.invalidPayload
            }
            let body = dictionary["body"] as? String
            let tag = dictionary["tag"] as? String
            return .showNotification(
                payload: DesktopNotificationPayload(
                    title: title,
                    body: body,
                    tag: tag,
                    eventId: eventId))
        case "setQuickAddHotkey":
            guard let shortcut = dictionary["shortcut"] as? String else {
                throw BridgeMessageError.invalidPayload
            }
            return .setQuickAddHotkey(shortcut: shortcut)
        case "dismissQuickAddPanel":
            return .dismissQuickAddPanel
        case "setAppearance":
            guard let theme = dictionary["theme"] as? String else {
                throw BridgeMessageError.invalidPayload
            }
            return .setAppearance(theme: theme)
        case "setLaunchAtLogin":
            guard let enabled = dictionary["enabled"] as? Bool else {
                throw BridgeMessageError.invalidPayload
            }
            return .setLaunchAtLogin(enabled: enabled)
        case "getLaunchAtLogin":
            return .getLaunchAtLogin
        case "reportDeepLinkNavigation":
            guard let path = dictionary["path"] as? String else {
                throw BridgeMessageError.invalidPayload
            }
            return .reportDeepLinkNavigation(path: path)
        default:
            throw BridgeMessageError.unknownMethod(method)
        }
    }
}

public enum BridgeMessageError: Error, Equatable {
    case invalidPayload
    case unknownMethod(String)
}
