import CompassKit
import SwiftUI

public struct ShortcutsCatalogView: View {
    @Environment(\.nativeWebTheme) private var theme
    public let sections: [ShortcutLegendSection]

    public init(sections: [ShortcutLegendSection]) {
        self.sections = sections
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Compass keyboard shortcuts")
                    .font(.custom("Rubik", size: 28, relativeTo: .largeTitle))
                    .foregroundStyle(theme.textColor)
                Text("The same catalog as the in-app legend. Press ? in Compass to search it.")
                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                    .foregroundStyle(theme.textMutedColor)

                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(section.title)
                            .font(.custom("Rubik", size: 16, relativeTo: .headline))
                            .foregroundStyle(theme.textColor)
                        ForEach(section.rows, id: \.id) { row in
                            HStack(alignment: .top) {
                                Text(row.label)
                                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                                Spacer()
                                Text(row.keycaps.joined(separator: " "))
                                    .font(.custom("Rubik", size: 13, relativeTo: .caption))
                                    .foregroundStyle(theme.textMutedColor)
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 640, alignment: .leading)
        }
        .background(theme.backgroundColor)
        .accessibilityIdentifier("compass-native-shortcuts-catalog")
    }
}
