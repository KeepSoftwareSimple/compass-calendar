import CompassData
import CompassKit
import SwiftUI

public struct ShortcutsLegendOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    public var model: NativeCalendarRootModel
    @Bindable private var legendStore: ShortcutsLegendStore
    @FocusState private var searchFocused: Bool

    public init(model: NativeCalendarRootModel) {
        self.model = model
        _legendStore = Bindable(wrappedValue: model.overlayStores.legend)
    }

    public var body: some View {
        if legendStore.isOpen {
            ZStack {
                theme.panelBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { legendStore.close() }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Keyboard shortcuts")
                            .font(.rubik(15, weight: .medium))
                            .foregroundStyle(theme.textColor)
                        Spacer()
                        Button("Close") { legendStore.close() }
                            .buttonStyle(.plain)
                            .foregroundStyle(theme.textMutedColor)
                    }

                    TextField("Search shortcuts", text: $legendStore.searchQuery)
                        .textFieldStyle(.plain)
                        .font(.rubik(14))
                        .focused($searchFocused)

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            ForEach(model.filteredLegendSections()) { section in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(section.title)
                                        .font(.rubik(13))
                                        .foregroundStyle(theme.textMutedColor)
                                    ForEach(section.rows, id: \.id) { row in
                                        legendRow(row)
                                    }
                                }
                            }
                        }
                    }
                    .frame(maxHeight: 420)
                }
                .padding(16)
                .frame(maxWidth: 640)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: theme.shadowDefaultColor, radius: 24, x: 0, y: 16)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Keyboard shortcuts")
                .accessibilityIdentifier("compass-native-shortcuts-panel")
                .padding(.horizontal, 24)
            }
            .focusOnAppear($searchFocused)
        }
    }

    @ViewBuilder
    private func legendRow(_ row: ShortcutLegendRow) -> some View {
        HStack(alignment: .top) {
            Text(row.label)
                .font(.rubik(13))
                .foregroundStyle(theme.textColor)
            Spacer()
            Text(KeycapGlyphs.display(row.keycaps))
                .font(.rubik(12))
                .foregroundStyle(theme.textMutedColor)
        }
        .accessibilityIdentifier("compass-native-legend-row-\(row.id.rawValue)")
    }
}

extension ShortcutLegendSection: Identifiable {}
extension ShortcutLegendRow: Identifiable {}
