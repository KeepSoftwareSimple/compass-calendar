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
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { legendStore.close() }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Keyboard shortcuts")
                            .font(.custom("Rubik", size: 16, relativeTo: .headline))
                            .foregroundStyle(theme.textColor)
                        Spacer()
                        Button("Close") { legendStore.close() }
                            .buttonStyle(.plain)
                            .foregroundStyle(theme.textMutedColor)
                    }

                    TextField("Search shortcuts", text: $legendStore.searchQuery)
                        .textFieldStyle(.plain)
                        .font(.custom("Rubik", size: 14, relativeTo: .body))
                        .focused($searchFocused)

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            ForEach(model.filteredLegendSections()) { section in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(section.title)
                                        .font(.custom("Rubik", size: 13, relativeTo: .headline))
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
                .frame(maxWidth: 560)
                .background(theme.surfacePanelColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("compass-native-shortcuts-legend")
            }
            .onAppear { searchFocused = true }
        }
    }

    @ViewBuilder
    private func legendRow(_ row: ShortcutLegendRow) -> some View {
        HStack(alignment: .top) {
            Text(row.label)
                .font(.custom("Rubik", size: 13, relativeTo: .body))
                .foregroundStyle(theme.textColor)
            Spacer()
            Text(row.keycaps.joined(separator: " "))
                .font(.custom("Rubik", size: 12, relativeTo: .caption))
                .foregroundStyle(theme.textMutedColor)
        }
        .accessibilityIdentifier("compass-native-legend-row-\(row.id.rawValue)")
    }
}

extension ShortcutLegendSection: Identifiable {}
extension ShortcutLegendRow: Identifiable {}
