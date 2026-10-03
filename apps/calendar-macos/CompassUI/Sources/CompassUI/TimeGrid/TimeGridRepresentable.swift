import CompassKit
import SwiftUI

public struct TimeGridRepresentable: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme

    private let state: TimeGridState
    private let onOpenTimeTravel: () -> Void

    public init(state: TimeGridState, onOpenTimeTravel: @escaping () -> Void = {}) {
        self.state = state
        self.onOpenTimeTravel = onOpenTimeTravel
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(onOpenTimeTravel: onOpenTimeTravel)
    }

    public func makeNSView(context: Context) -> TimeGridView {
        let view = TimeGridView(state: state, theme: theme)
        view.delegate = context.coordinator
        return view
    }

    public func updateNSView(_ nsView: TimeGridView, context: Context) {
        context.coordinator.onOpenTimeTravel = onOpenTimeTravel
        nsView.update(state: state, theme: theme)
    }

    public final class Coordinator: NSObject, TimeGridViewDelegate {
        var onOpenTimeTravel: () -> Void

        init(onOpenTimeTravel: @escaping () -> Void) {
            self.onOpenTimeTravel = onOpenTimeTravel
        }

        func timeGridViewDidRequestShortcutHint(_ view: TimeGridView) {}

        func timeGridViewDidRequestTimeTravel(_ view: TimeGridView) {
            onOpenTimeTravel()
        }
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
