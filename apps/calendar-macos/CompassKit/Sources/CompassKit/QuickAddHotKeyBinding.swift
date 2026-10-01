import Carbon.HIToolbox
import Foundation

/// Parsed global hotkey for Carbon `RegisterEventHotKey`.
public struct QuickAddHotKeyBinding: Equatable, Sendable {
    public let keyCode: UInt32
    public let carbonModifiers: UInt32
    public let displayString: String

    public init(keyCode: UInt32, carbonModifiers: UInt32, displayString: String) {
        self.keyCode = keyCode
        self.carbonModifiers = carbonModifiers
        self.displayString = displayString
    }
}

public enum QuickAddHotKeyStorage {
    public static let userDefaultsKey = "compassQuickAddHotkey"
    public static let defaultDisplayString = "Ctrl+Option+Cmd+Space"

    public static func load(from defaults: UserDefaults = .standard) -> QuickAddHotKeyBinding {
        guard let raw = defaults.string(forKey: userDefaultsKey),
              let parsed = QuickAddHotKeyParser.parse(raw)
        else {
            return QuickAddHotKeyParser.defaultBinding
        }
        return parsed
    }

    public static func save(_ binding: QuickAddHotKeyBinding, to defaults: UserDefaults = .standard) {
        defaults.set(binding.displayString, forKey: userDefaultsKey)
    }
}

public enum QuickAddHotKeyParser {
    public static let defaultBinding: QuickAddHotKeyBinding = {
        guard let parsed = parse(QuickAddHotKeyStorage.defaultDisplayString) else {
            fatalError("default quick-add hotkey must parse")
        }
        return parsed
    }()

    /// Parses strings like `Ctrl+Option+Cmd+Space` (order of modifiers free).
    public static func parse(_ raw: String) -> QuickAddHotKeyBinding? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let parts = trimmed.split(separator: "+").map { String($0) }
        guard parts.count >= 2 else { return nil }

        var modifiers: UInt32 = 0
        var keyToken: String?
        for part in parts {
            let normalized = part.trimmingCharacters(in: .whitespaces).lowercased()
            switch normalized {
            case "ctrl", "control":
                modifiers |= UInt32(controlKey)
            case "option", "alt":
                modifiers |= UInt32(optionKey)
            case "cmd", "command", "mod":
                modifiers |= UInt32(cmdKey)
            case "shift":
                modifiers |= UInt32(shiftKey)
            default:
                if keyToken != nil { return nil }
                keyToken = part.trimmingCharacters(in: .whitespaces)
            }
        }
        guard let keyToken, let keyCode = keyCode(for: keyToken) else { return nil }
        guard modifiers != 0 else { return nil }
        return QuickAddHotKeyBinding(
            keyCode: keyCode,
            carbonModifiers: modifiers,
            displayString: trimmed)
    }

    private static func keyCode(for token: String) -> UInt32? {
        if token.count == 1, let letter = token.uppercased().first,
           letter >= "A", letter <= "Z"
        {
            return ansiLetterKeyCode(letter)
        }
        switch token.lowercased() {
        case "space":
            return UInt32(kVK_Space)
        case "return", "enter":
            return UInt32(kVK_Return)
        case "escape", "esc":
            return UInt32(kVK_Escape)
        default:
            return nil
        }
    }

    /// Physical ANSI key positions from `Events.h` (not contiguous in A–Z order).
    private static func ansiLetterKeyCode(_ letter: Character) -> UInt32 {
        switch letter {
        case "A": return UInt32(kVK_ANSI_A)
        case "B": return UInt32(kVK_ANSI_B)
        case "C": return UInt32(kVK_ANSI_C)
        case "D": return UInt32(kVK_ANSI_D)
        case "E": return UInt32(kVK_ANSI_E)
        case "F": return UInt32(kVK_ANSI_F)
        case "G": return UInt32(kVK_ANSI_G)
        case "H": return UInt32(kVK_ANSI_H)
        case "I": return UInt32(kVK_ANSI_I)
        case "J": return UInt32(kVK_ANSI_J)
        case "K": return UInt32(kVK_ANSI_K)
        case "L": return UInt32(kVK_ANSI_L)
        case "M": return UInt32(kVK_ANSI_M)
        case "N": return UInt32(kVK_ANSI_N)
        case "O": return UInt32(kVK_ANSI_O)
        case "P": return UInt32(kVK_ANSI_P)
        case "Q": return UInt32(kVK_ANSI_Q)
        case "R": return UInt32(kVK_ANSI_R)
        case "S": return UInt32(kVK_ANSI_S)
        case "T": return UInt32(kVK_ANSI_T)
        case "U": return UInt32(kVK_ANSI_U)
        case "V": return UInt32(kVK_ANSI_V)
        case "W": return UInt32(kVK_ANSI_W)
        case "X": return UInt32(kVK_ANSI_X)
        case "Y": return UInt32(kVK_ANSI_Y)
        case "Z": return UInt32(kVK_ANSI_Z)
        default:
            fatalError("ansiLetterKeyCode called with non-letter scalar")
        }
    }
}
