import CompassData
import SwiftUI

public struct CommandPaletteOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    public var model: NativeCalendarRootModel
    @Bindable private var paletteStore: CommandPaletteStore
    @FocusState private var searchFocused: Bool
    @State private var resultsHeight: CGFloat = 360

    public init(model: NativeCalendarRootModel) {
        self.model = model
        _paletteStore = Bindable(wrappedValue: model.overlayStores.palette)
    }

    public var body: some View {
        if paletteStore.isOpen {
            let sections = model.filteredPaletteSections()
            let selectedId = model.selectedPaletteItemId
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { paletteStore.close() }

                VStack(alignment: .leading, spacing: 12) {
                    TextField(
                        "Search commands, events, or type a date",
                        text: $paletteStore.query
                    )
                    .textFieldStyle(.plain)
                    .font(.rubik(15))
                    .foregroundStyle(theme.textColor)
                    .focused($searchFocused)
                    .accessibilityIdentifier("compass-native-command-palette-search")

                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 8) {
                                if sections.isEmpty {
                                    Text("No results for “\(paletteStore.query)”")
                                        .foregroundStyle(theme.textMutedColor)
                                        .padding(12)
                                }
                                ForEach(sections) { section in
                                    if !section.heading.isEmpty {
                                        Text(section.heading)
                                            .font(.rubik(12))
                                            .foregroundStyle(theme.textMutedColor)
                                    }
                                    ForEach(section.items) { item in
                                        paletteRow(item, selected: item.id == selectedId)
                                            .id(item.id)
                                    }
                                }
                            }
                            .background {
                                GeometryReader { geometry in
                                    Color.clear.preference(key: PaletteResultsHeightKey.self, value: geometry.size.height)
                                }
                            }
                        }
                        .frame(height: min(resultsHeight, 360))
                        .onPreferenceChange(PaletteResultsHeightKey.self) { resultsHeight = $0 }
                        .onChange(of: selectedId) { _, id in
                            if let id { proxy.scrollTo(id, anchor: .center) }
                        }
                        .onChange(of: paletteStore.query) { _, _ in
                            if let selectedId { proxy.scrollTo(selectedId, anchor: .top) }
                        }
                    }
                    Text("↑ ↓ Navigate   ↵ Select   Esc Close")
                        .font(.rubik(11))
                        .foregroundStyle(theme.textMutedColor)
                        .accessibilityLabel("Up and Down navigate, Return selects, Escape closes")
                }
                .padding(16)
                .frame(maxWidth: 520)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("compass-native-command-palette")
            }
            .focusOnAppear($searchFocused)
            .onChange(of: paletteStore.query) { _, _ in
                model.schedulePaletteEventSearch()
            }
        }
    }

    @ViewBuilder
    private func paletteRow(_ item: CommandPaletteItem, selected: Bool) -> some View {
        Button {
            model.runPaletteCommand(id: item.id)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .font(.rubik(14))
                        .foregroundStyle(theme.textColor)
                    if let subtitle = item.subtitle {
                        Text(subtitle)
                            .font(.rubik(11))
                            .foregroundStyle(theme.textMutedColor)
                    }
                }
                Spacer()
                if let shortcut = item.shortcut {
                    Text(shortcut)
                        .font(.rubik(12))
                        .foregroundStyle(theme.textMutedColor)
                }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(selected ? theme.accentColor.opacity(0.18) : theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("compass-native-palette-item-\(item.id)")
    }
}

private struct PaletteResultsHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 360 }

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
