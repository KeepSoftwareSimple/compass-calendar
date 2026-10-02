import AppKit
import CompassKit

extension KeyEvent {
    init?(nsEvent: NSEvent) {
        guard nsEvent.type == .keyDown else { return nil }
        let modifiers = KeyModifiers(nsFlags: nsEvent.modifierFlags)
        guard let token = KeyToken(nsEvent: nsEvent) else { return nil }
        self.init(key: token, modifiers: modifiers, isRepeat: nsEvent.isARepeat)
    }
}

extension KeyModifiers {
    init(nsFlags: NSEvent.ModifierFlags) {
        var value = KeyModifiers()
        if nsFlags.contains(.command) { value.insert(.command) }
        if nsFlags.contains(.shift) { value.insert(.shift) }
        if nsFlags.contains(.option) { value.insert(.option) }
        if nsFlags.contains(.control) { value.insert(.control) }
        self = value
    }
}

extension KeyToken {
    init?(nsEvent: NSEvent) {
        switch nsEvent.keyCode {
        case 53: self = .named(.escape)
        case 36: self = .named(.enter)
        case 48: self = .named(.tab)
        case 126: self = .named(.arrowUp)
        case 125: self = .named(.arrowDown)
        case 123: self = .named(.arrowLeft)
        case 124: self = .named(.arrowRight)
        case 116: self = .named(.pageUp)
        case 121: self = .named(.pageDown)
        case 51: self = .named(.delete)
        default:
            guard let chars = nsEvent.charactersIgnoringModifiers?.lowercased(), let first = chars.first else {
                return nil
            }
            if first.isLetter || first.isNumber {
                self = .character(first)
            } else {
                self = .punctuation(String(first))
            }
        }
    }
}
