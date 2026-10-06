import CompassData
import CompassKit
import SwiftUI

struct EnableContactSuggestionsNudgeView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    @State private var isVisible = ContactSuggestionsNudgeGate.shouldShow

    var body: some View {
        if isVisible {
            HStack {
                Button("Enable contact suggestions") {
                    Task { await model.syncConnectionsStore.connect(provider: .google) }
                }
                .font(.custom("Rubik", size: 11))
                .foregroundStyle(theme.accentColor)
                Spacer()
                Button {
                    ContactSuggestionsNudgeGate.dismiss()
                    isVisible = false
                } label: {
                    Text("Dismiss")
                        .font(.custom("Rubik", size: 11))
                        .foregroundStyle(theme.textMutedColor)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 4)
            .onAppear { ContactSuggestionsNudgeGate.markShown() }
        }
    }
}

enum ContactSuggestionsNudgeGate {
    private static let dismissedKey = "compass.contactsNudge.dismissed"
    private nonisolated(unsafe) static var shownThisSession = false

    static var shouldShow: Bool {
        !shownThisSession && !UserDefaults.standard.bool(forKey: dismissedKey)
    }

    static func markShown() {
        shownThisSession = true
    }

    static func dismiss() {
        UserDefaults.standard.set(true, forKey: dismissedKey)
    }
}
