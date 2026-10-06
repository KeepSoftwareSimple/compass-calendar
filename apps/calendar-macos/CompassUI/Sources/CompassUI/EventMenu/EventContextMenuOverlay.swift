import CompassData
import CompassKit
import SwiftUI

public struct EventContextMenuOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    public var model: NativeCalendarRootModel
    @Bindable private var menuStore: EventMenuStore

    public init(model: NativeCalendarRootModel) {
        self.model = model
        _menuStore = Bindable(wrappedValue: model.overlayStores.eventMenu)
    }

    public var body: some View {
        if menuStore.isOpen, let eventId = menuStore.eventId, let event = model.event(for: eventId) {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { model.closeEventMenu() }

                VStack(alignment: .leading, spacing: 4) {
                    menuRow(label: model.isReadOnly(event: event) ? "View" : "Edit", keys: ["Enter"]) {
                        model.promptEventMenuKeyboardOnly(label: "Edit", keycaps: ["Enter"])
                    }
                    menuRow(label: "Duplicate", keys: ["⌘", "D"]) {
                        model.promptEventMenuKeyboardOnly(label: "Duplicate", keycaps: ["Mod", "D"])
                    }
                    menuRow(
                        label: model.isEventHidden(eventId: eventId) ? "Show event" : "Hide event",
                        keys: ["X"]
                    ) {
                        model.promptEventMenuKeyboardOnly(label: "Hide event", keycaps: ["X"])
                    }
                    if !model.isReadOnly(event: event) {
                        menuRow(label: "Delete", keys: ["Delete"]) {
                            model.promptEventMenuKeyboardOnly(label: "Delete", keycaps: ["Delete"])
                        }
                    }
                }
                .padding(8)
                .frame(minWidth: 220, alignment: .leading)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.borderColor, lineWidth: 1))
                .accessibilityIdentifier("compass-native-event-menu")
            }
        }
    }

    @ViewBuilder
    private func menuRow(label: String, keys: [String], action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label)
                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                    .foregroundStyle(theme.textColor)
                Spacer()
                HStack(spacing: 4) {
                    ForEach(keys, id: \.self) { key in
                        ShortcutHintChip(label: key)
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("compass-native-event-menu-\(label.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }
}
