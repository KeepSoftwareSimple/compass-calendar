import Foundation

/// Keyboard dispatch scopes ordered from lowest to highest precedence.
public enum ShortcutScope: Int, CaseIterable, Hashable, Sendable, Comparable {
    case global = 0
    case grid = 1
    case form = 2
    case modal = 3

    public static func < (lhs: ShortcutScope, rhs: ShortcutScope) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}
