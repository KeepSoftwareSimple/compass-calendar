import Foundation

/// Text-field gating table from the desktop spec: while typing, bare letters
/// pass through to the field, including the `e` edit leader (web parity: bare
/// `e` bails on editable targets, so "Quarterly" never jumps to recurrence). Mod
/// chords, Escape, and Enter still route.
public enum TextInputShortcutGating {
    private static let nativeClipboardLetters: Set<Character> = ["a", "c", "v", "x"]

    public static func shouldDispatch(_ event: KeyEvent) -> Bool {
        if event.matches(KeyChord(token: .named(.escape))) { return true }
        if event.matches(KeyChord(token: .named(.enter))) { return true }
        if event.isModChord {
            if case .character(let char) = event.key,
               nativeClipboardLetters.contains(Character(char.lowercased()))
            {
                return false
            }
            return true
        }
        if event.isBareLetter { return false }
        return true
    }
}
