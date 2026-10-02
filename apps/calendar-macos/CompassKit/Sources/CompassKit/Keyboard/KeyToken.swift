import Foundation

public enum NamedKey: String, Hashable, Sendable, CaseIterable {
    case escape = "Escape"
    case enter = "Enter"
    case delete = "Delete"
    case tab = "Tab"
    case pageUp = "PageUp"
    case pageDown = "PageDown"
    case arrowUp = "ArrowUp"
    case arrowDown = "ArrowDown"
    case arrowLeft = "ArrowLeft"
    case arrowRight = "ArrowRight"
}

public enum DigitRange: String, Hashable, Sendable {
    case oneThroughNine = "1-9"
    case zeroThroughNine = "0-9"
}

public enum KeyToken: Hashable, Sendable {
    case character(Character)
    case named(NamedKey)
    case digitRange(DigitRange)
    /// Legend example for typed-time create (`1130`).
    case typedTimeExample
    /// Legend placeholder for move-focus rows (`Arrow keys`).
    case arrowKeysLegend
    case punctuation(String)
}
