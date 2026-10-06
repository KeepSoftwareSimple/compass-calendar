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
