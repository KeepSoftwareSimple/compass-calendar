import Foundation

public struct DesktopAgendaItem: Codable, Equatable, Sendable {
    public var title: String
    public var startsAt: String

    public init(title: String, startsAt: String) {
        self.title = title
        self.startsAt = startsAt
    }
}

public enum BridgeMessage: Equatable, Sendable {
    case openExternal(url: String)
    case setAgenda(items: [DesktopAgendaItem])
    case restartToUpdate
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
                guard let title = item["title"] as? String,
                      let startsAt = item["startsAt"] as? String
                else {
                    throw BridgeMessageError.invalidPayload
                }
                return DesktopAgendaItem(title: title, startsAt: startsAt)
            }
            return .setAgenda(items: items)
        case "restartToUpdate":
            return .restartToUpdate
        default:
            throw BridgeMessageError.unknownMethod(method)
        }
    }
}

public enum BridgeMessageError: Error, Equatable {
    case invalidPayload
    case unknownMethod(String)
}
