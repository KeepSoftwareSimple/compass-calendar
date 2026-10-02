import Foundation

/// One concrete or pattern binding from the exported shortcut registry.
public struct KeyChord: Hashable, Sendable {
    public let modifiers: KeyModifiers
    public let token: KeyToken

    public init(modifiers: KeyModifiers = [], token: KeyToken) {
        self.modifiers = modifiers
        self.token = token
    }
}

public enum KeyChordParseError: Error, Equatable, Sendable {
    case emptyInput
    case unknownToken(String)
    case missingKey
}

public enum KeyChordParser {
    /// Parses `Mod+Shift+Z`, `ArrowUp`, bare letters, digits, and punctuation tokens.
    public static func parseHotkey(_ raw: String) throws -> KeyChord {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw KeyChordParseError.emptyInput }
        return try parseKeycaps(hotkeyKeycaps(trimmed))
    }

    /// Splits a tanstack-style hotkey on `+` (same as the TypeScript export).
    public static func hotkeyKeycaps(_ hotkey: String) -> [String] {
        hotkey.split(separator: "+", omittingEmptySubsequences: false).map(String.init)
    }

    /// Parses one keycap row such as `["Mod", "Shift", "Z"]` or `["Mod+E"]`.
    public static func parseKeycaps(_ keycaps: [String]) throws -> KeyChord {
        let chords = try parseKeycapAlternatives(keycaps)
        guard let first = chords.first else { throw KeyChordParseError.missingKey }
        guard chords.count == 1 else { throw KeyChordParseError.unknownToken(keycaps.joined(separator: "+")) }
        return first
    }

    /// Parses a flat keycap list that may encode several single-key alternatives.
    public static func parseKeycapAlternatives(_ keycaps: [String]) throws -> [KeyChord] {
        var modifiers = KeyModifiers()
        var chords: [KeyChord] = []
        for raw in keycaps {
            let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !token.isEmpty else { continue }
            if token.contains("+") {
                chords.append(try parseHotkey(token))
                modifiers = []
                continue
            }
            if let modifier = modifier(for: token) {
                modifiers.insert(modifier)
                continue
            }
            chords.append(KeyChord(modifiers: modifiers, token: try keyToken(for: token)))
            modifiers = []
        }
        if chords.isEmpty, !modifiers.isEmpty {
            throw KeyChordParseError.missingKey
        }
        return chords
    }

    public enum RegistryToken: Hashable, Sendable {
        case modifier(KeyModifiers)
        case key(KeyToken)
    }

    /// Parses any token from a registry `keys` row or bindings keycap list.
    public static func parseRegistryToken(_ raw: String) throws -> RegistryToken {
        let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.contains("+") {
            return .key(try parseHotkey(token).token)
        }
        if let modifier = modifier(for: token) {
            return .modifier(modifier)
        }
        return .key(try keyToken(for: token))
    }

    private static func modifier(for token: String) -> KeyModifiers? {
        switch token {
        case "Mod":
            return .command
        case "Shift":
            return .shift
        case "Alt":
            return .option
        case "Ctrl", "Control":
            return .control
        default:
            return nil
        }
    }

    private static func keyToken(for token: String) throws -> KeyToken {
        if token == "Arrow keys" {
            return .arrowKeysLegend
        }
        if token == "1130" {
            return .typedTimeExample
        }
        if let range = DigitRange(rawValue: token) {
            return .digitRange(range)
        }
        if let named = NamedKey(rawValue: token) {
            return .named(named)
        }
        if token.count == 1, let scalar = token.unicodeScalars.first {
            let character = Character(scalar)
            if character.isLetter {
                return .character(Character(String(character).lowercased()))
            }
            if character.isNumber {
                return .character(character)
            }
            return .punctuation(String(character))
        }
        throw KeyChordParseError.unknownToken(token)
    }
}
