import CompassData
import CompassKit
import SwiftUI

public struct TimeGridRepresentable: NSViewRepresentable {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable private var model: NativeCalendarRootModel
    private let focusedEventId: String?

    public init(model: NativeCalendarRootModel, focusedEventId: String?) {
        self.model = model
        self.focusedEventId = focusedEventId
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    public func makeNSView(context: Context) -> TimeGridView {
        let view = TimeGridView(state: model.timeGridState, theme: theme)
        view.delegate = context.coordinator
        return view
    }

    public func updateNSView(_ nsView: TimeGridView, context: Context) {
        context.coordinator.theme = theme
        syncGrid(nsView, theme: theme)
        if let scroll = model.consumePendingScroll() {
            nsView.applyScroll(scroll)
        }
    }

    private func syncGrid(_ nsView: TimeGridView, theme: NativeWebTheme) {
        nsView.update(state: model.timeGridState, theme: theme)
        nsView.layoutSubtreeIfNeeded()
    }

    @MainActor
    public final class Coordinator: NSObject, TimeGridViewDelegate {
        private let model: NativeCalendarRootModel
        fileprivate var theme: NativeWebTheme = .lightBeach

        init(model: NativeCalendarRootModel) {
            self.model = model
            super.init()
        }

        public func timeGridViewDidRequestShortcutHint(_ view: TimeGridView) {
            guard let registry = model.shortcutRegistry else { return }
            model.handleGridPointerDown(registry: registry)
        }

        public func timeGridView(_ view: TimeGridView, didClickEvent eventId: String) {
            model.focusGridEvent(eventId: eventId)
            model.publishGridFocusAccessibilityProbe()
            if let registry = model.shortcutRegistry {
                model.showPointerHint(
                    for: .eventCard,
                    registry: registry,
                    focusedGridEventLabel: model.gridFocusAccessibilityLabel
                )
            }
            view.update(state: model.timeGridState, theme: theme)
            view.layoutSubtreeIfNeeded()
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
