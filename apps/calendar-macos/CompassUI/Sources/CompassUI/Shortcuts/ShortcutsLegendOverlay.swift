import CompassData
import CompassKit
import SwiftUI

public struct ShortcutsLegendOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @FocusState private var searchFocused: Bool

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.shortcutsLegendStore.isOpen {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { model.shortcutsLegendStore.close() }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Keyboard shortcuts")
                            .font(.custom("Rubik", size: 16, relativeTo: .headline))
                            .foregroundStyle(theme.textColor)
                        Spacer()
                        Button("Close") { model.shortcutsLegendStore.close() }
                            .buttonStyle(.plain)
                            .foregroundStyle(theme.textMutedColor)
                    }

                    TextField("Search shortcuts", text: $model.shortcutsLegendStore.searchQuery)
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
