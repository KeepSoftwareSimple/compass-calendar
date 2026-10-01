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
        if token.count == 1, let scalar = token.uppercased().unicodeScalars.first {
            let letter = scalar.value
            if letter >= UnicodeScalar("A").value, letter <= UnicodeScalar("Z").value {
                return UInt32(kVK_ANSI_A) + (letter - UnicodeScalar("A").value)
            }
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
}
