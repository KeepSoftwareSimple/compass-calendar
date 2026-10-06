import CompassData
import CompassKit
import SwiftUI

struct SettingsQuickAddHotkeySectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var settingsStore: SettingsStore
    @State private var draft: String = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Global quick add")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            Text("Opens a floating panel from any app. Uses a system hotkey, not Accessibility.")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            TextField("Shortcut", text: $draft)
                .textFieldStyle(.roundedBorder)
                .onSubmit { persist() }
                .onAppear { draft = settingsStore.quickAddHotKeyDisplay }
            if let error {
                Text(error)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.errorColor)
            }
            Button("Restore default (\(QuickAddHotKeyStorage.defaultDisplayString))") {
                draft = QuickAddHotKeyStorage.defaultDisplayString
                persist()
            }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 12))
            .foregroundStyle(theme.accentColor)
        }
        .accessibilityIdentifier("settings-section-quick-add-hotkey")
        .onChange(of: draft) { _, _ in error = nil }
        .onChange(of: settingsStore.quickAddHotKeyDisplay) { _, value in
            draft = value
        }
    }

    private func persist() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 3 else {
            error = "Enter a shortcut with at least one modifier and a key."
            return
        }
        guard settingsStore.setQuickAddHotKey(trimmed) else {
            error = "That shortcut is not valid."
            return
        }
        error = nil
    }
}
