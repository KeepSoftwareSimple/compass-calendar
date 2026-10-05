import CompassData
import SwiftUI

public struct CommandPaletteOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    public var model: NativeCalendarRootModel
    @Bindable private var paletteStore: CommandPaletteStore
    @FocusState private var searchFocused: Bool

    public init(model: NativeCalendarRootModel) {
        self.model = model
        _paletteStore = Bindable(wrappedValue: model.overlayStores.palette)
    }

    public var body: some View {
        if paletteStore.isOpen {
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
                    .font(.custom("Rubik", size: 15, relativeTo: .body))
                    .foregroundStyle(theme.textColor)
                    .focused($searchFocused)
                    .accessibilityIdentifier("compass-native-command-palette-search")

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(model.filteredPaletteSections()) { section in
                                if !section.heading.isEmpty {
                                    Text(section.heading)
                                        .font(.custom("Rubik", size: 12, relativeTo: .caption))
                                        .foregroundStyle(theme.textMutedColor)
                                }
                                ForEach(section.items) { item in
                                    paletteRow(item)
                                }
                            }
                        }
                    }
                    .frame(maxHeight: 360)
                }
                .padding(16)
                .frame(maxWidth: 520)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityIdentifier("compass-native-command-palette")
            }
            .onAppear { searchFocused = true }
            .onChange(of: paletteStore.query) { _, _ in
                model.schedulePaletteEventSearch()
            }
        }
    }

    @ViewBuilder
    private func paletteRow(_ item: CommandPaletteItem) -> some View {
        Button {
            model.runPaletteCommand(id: item.id)
        } label: {
            HStack {
                Text(item.label)
                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                    .foregroundStyle(theme.textColor)
                Spacer()
                if let shortcut = item.shortcut {
                    Text(shortcut)
                        .font(.custom("Rubik", size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.textMutedColor)
                }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("compass-native-palette-item-\(item.id)")
    }
}
