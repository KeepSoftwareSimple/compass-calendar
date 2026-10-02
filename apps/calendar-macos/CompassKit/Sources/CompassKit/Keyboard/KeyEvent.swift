import Foundation

/// Normalized key-down or flags-changed input for the keyboard engine.
public struct KeyEvent: Hashable, Sendable {
    public let key: KeyToken
    public let modifiers: KeyModifiers
    public let isRepeat: Bool

    public init(key: KeyToken, modifiers: KeyModifiers = [], isRepeat: Bool = false) {
        self.key = key
        self.modifiers = modifiers
        self.isRepeat = isRepeat
    }

    public init(
        character: Character,
        modifiers: KeyModifiers = [],
        isRepeat: Bool = false
    ) {
        self.init(
            key: .character(Character(String(character).lowercased())),
            modifiers: modifiers,
            isRepeat: isRepeat)
    }

    public init(named: NamedKey, modifiers: KeyModifiers = [], isRepeat: Bool = false) {
        self.init(key: .named(named), modifiers: modifiers, isRepeat: isRepeat)
    }

    public func matches(_ chord: KeyChord) -> Bool {
        guard modifiers == chord.modifiers else { return false }
        switch (key, chord.token) {
        case (.character(let lhs), .character(let rhs)):
            return lhs.lowercased() == rhs.lowercased()
        case (.named(let lhs), .named(let rhs)):
            return lhs == rhs
        case (.digitRange(let lhs), .digitRange(let rhs)):
            return lhs == rhs
        case (.punctuation(let lhs), .punctuation(let rhs)):
            return lhs == rhs
        case (.typedTimeExample, .typedTimeExample), (.arrowKeysLegend, .arrowKeysLegend):
            return true
        default:
            return false
        }
    }

    public var isBareLetter: Bool {
        guard modifiers.isEmpty, !isRepeat else { return false }
        if case .character(let character) = key {
            return character.isLetter
        }
        return false
    }

    public var isModChord: Bool {
        modifiers.contains(.command)
    }
}
