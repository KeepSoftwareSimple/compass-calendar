import Foundation

/// Text-field gating table from the desktop spec: while typing, bare letters
/// pass through; Mod chords, Escape, Enter, and the edit leader still route.
public enum TextInputShortcutGating {
    public static func shouldDispatch(_ event: KeyEvent, leaderKey: Character) -> Bool {
        if event.matches(KeyChord(token: .named(.escape))) { return true }
        if event.matches(KeyChord(token: .named(.enter))) { return true }
        if event.isModChord { return true }
        if isLeaderRoute(event, leaderKey: leaderKey) { return true }
        if event.isBareLetter { return false }
        return true
    }

    private static func isLeaderRoute(_ event: KeyEvent, leaderKey: Character) -> Bool {
        guard event.modifiers.isEmpty else { return false }
        guard case .character(let character) = event.key else { return false }
        return character.lowercased() == Character(String(leaderKey).lowercased())
    }
}
