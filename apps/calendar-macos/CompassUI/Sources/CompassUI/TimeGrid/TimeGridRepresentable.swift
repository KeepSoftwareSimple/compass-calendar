import CompassKit
import SwiftUI

public struct TimeGridRepresentable: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme

    private let state: TimeGridState

    public init(state: TimeGridState) {
        self.state = state
    }

    public func makeNSView(context: Context) -> TimeGridView {
        TimeGridView(state: state, theme: theme)
    }

    public func updateNSView(_ nsView: TimeGridView, context: Context) {
        nsView.update(state: state, theme: theme)
    }
}

public enum TimeGridPreviewFactory {
    public static func weekPreviewState(visibleDayCount: Int = 3) -> TimeGridState {
        let keys: [String]
        switch visibleDayCount {
        case 1:
            keys = ["2026-05-20"]
        case 7:
            keys = [
                "2026-05-17",
                "2026-05-18",
                "2026-05-19",
                "2026-05-20",
                "2026-05-21",
                "2026-05-22",
                "2026-05-23",
            ]
        default:
            keys = ["2026-05-19", "2026-05-20", "2026-05-21"]
        }

        return TimeGridState(
            layoutMode: .week,
            scenario: GridLayoutSnapshotFixtures.parityScenario(
                layoutMode: .week,
                visibleDateKeys: keys
            ),
            trackWidth: visibleDayCount == 7 ? 1170 : 1010
        )
    }
}
