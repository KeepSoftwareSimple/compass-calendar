import CompassData
import CompassKit
import SwiftUI

/// Web `SelectView`: the header title is a button that opens a menu of
/// Today (or This Week), Day, Week, and Life, each with its shortcut key.
struct ViewSwitcherView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    private struct Option: Identifiable {
        let id: ShortcutId
        let label: String
        let key: String
        let view: CalendarGridView?
    }

    private var options: [Option] {
        let current = model.viewStore.view
        return [
            Option(
                id: current == .life ? .navLifeCurrent : .navToday,
                label: current == .week ? "This Week" : "Today",
                key: "T",
                view: nil
            ),
            Option(id: .navDayView, label: "Day", key: "D", view: .day),
            Option(id: .navWeekView, label: "Week", key: "W", view: .week),
            Option(id: .navLifeView, label: "Life", key: "L", view: .life),
        ]
    }

    var body: some View {
        Button {
            model.isViewSwitcherOpen.toggle()
        } label: {
            HStack(spacing: 6) {
                Text(model.headerTitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(theme.textMutedColor)
            }
            .padding(.horizontal, 4)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.accentColor.opacity(model.nowCueHeaderHighlight ? 0.1 : 0))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(
                        theme.accentColor.opacity(model.nowCueHeaderHighlight ? 0.45 : 0),
                        lineWidth: 2
                    )
            )
            .animation(.easeInOut(duration: 0.35), value: model.nowCueHeaderHighlight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.headerTitle)
        .accessibilityHint("Change view")
        .help("Change view: Day (D), Week (W), Life (L), Today (T)")
        .accessibilityIdentifier("compass-native-header-title")
        .pageJumpChipAnchor(id: "view-select")
        .popover(isPresented: $model.isViewSwitcherOpen, arrowEdge: .bottom) {
            menu
        }
        .onChange(of: model.viewStore.view) { _, _ in
            model.isViewSwitcherOpen = false
        }
    }

    private var menu: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(options) { option in
                Button {
                    model.isViewSwitcherOpen = false
                    model.handleShortcut(option.id)
                } label: {
                    HStack(spacing: 8) {
                        Text(option.label)
                            .font(.rubik(14))
                            .foregroundStyle(
                                option.view == model.viewStore.view ? theme.accentColor : theme.textMutedColor
                            )
                        Spacer(minLength: 16)
                        ShortcutHintChip(label: option.key)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.view == model.viewStore.view ? .isSelected : [])
            }
        }
        .padding(.vertical, 4)
        .frame(minWidth: 180)
        .background(theme.surfaceColor)
    }
}
