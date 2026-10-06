import CompassKit
import SwiftUI

struct BlockPartySimOverlayView: View {
    @Environment(\.nativeWebTheme) private var theme
    let overlay: BlockPartySimOverlay

    var body: some View {
        ZStack {
            theme.overlayBackdropColor.opacity(0.6)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.custom("Rubik", size: 18, relativeTo: .headline))
                    .foregroundStyle(theme.textColor)
                ForEach(rows, id: \.self) { row in
                    Text(row)
                        .font(.custom("Rubik", size: 13))
                        .foregroundStyle(theme.textMutedColor)
                }
                Text("Press Esc to close")
                    .font(.custom("Rubik", size: 11))
                    .foregroundStyle(theme.textMutedColor)
            }
            .padding(20)
            .frame(maxWidth: 360)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(theme.borderColor, lineWidth: 1)
            }
        }
        .accessibilityIdentifier("block-party-sim-overlay")
    }

    private var title: String {
        switch overlay {
        case .legend: return "Shortcut legend"
        case .pagejump: return "Jump anywhere"
        case .palette: return "Command palette"
        }
    }

    private var rows: [String] {
        switch overlay {
        case .legend:
            return ["Create event: C", "Command palette: Cmd K", "Shortcuts: ?"]
        case .pagejump:
            return ["Hold Cmd until numbers appear", "Press 1 to jump"]
        case .palette:
            return ["Go to today", "Show shortcuts", "Play Block Party"]
        }
    }
}
