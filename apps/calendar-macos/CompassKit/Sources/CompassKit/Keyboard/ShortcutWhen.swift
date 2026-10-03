import Foundation

public struct ShortcutContext: Hashable, Sendable {
    public var lifeView: Bool
    public var weekView: Bool
    public var isFormOpen: Bool
    public var isTrialing: Bool

    public init(
        lifeView: Bool = false,
        weekView: Bool = false,
        isFormOpen: Bool = false,
        isTrialing: Bool = false
    ) {
        self.lifeView = lifeView
        self.weekView = weekView
        self.isFormOpen = isFormOpen
        self.isTrialing = isTrialing
    }
}

public struct ShortcutContextWhen: Hashable, Sendable, Decodable {
    public let lifeView: Bool?
    public let weekView: Bool?
    public let isFormOpen: Bool?
    public let isTrialing: Bool?
}

public enum ShortcutWhen {
    public static func matches(_ when: ShortcutContextWhen?, context: ShortcutContext) -> Bool {
        guard let when else { return true }
        if when.lifeView == true, context.lifeView != true { return false }
        if when.weekView == true, context.weekView != true { return false }
        if when.isFormOpen == true, context.isFormOpen != true { return false }
        if when.isTrialing == true, context.isTrialing != true { return false }
        return true
    }
}
