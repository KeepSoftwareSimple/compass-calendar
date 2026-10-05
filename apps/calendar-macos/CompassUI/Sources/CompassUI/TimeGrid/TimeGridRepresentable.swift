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

        public func timeGridViewDidRequestShortcutHint(
            _ view: TimeGridView,
            at locationInWindow: NSPoint
        ) {
            if let eventId = UITestLaunchPolicy.gridClickFocusEventId {
                timeGridView(view, didClickEvent: eventId)
                return
            }
            model.handleGridPointerDown(registry: model.shortcutRegistry)
        }

        public func timeGridView(_ view: TimeGridView, didClickEvent eventId: String) {
            model.focusGridEvent(eventId: eventId)
            view.update(state: model.timeGridState, theme: theme)
            view.layoutSubtreeIfNeeded()
            model.publishGridFocusAccessibilityProbe(eventId: eventId)
            let focusedLabel =
                model.gridFocusAccessibilityLabel
                ?? focusedEventLabel(for: eventId)
            model.showPointerHint(
                for: .eventCard,
                registry: model.shortcutRegistry,
                focusedGridEventLabel: focusedLabel
            )
        }

        public func timeGridView(
            _ view: TimeGridView,
            didEditDraftTitle title: String,
            eventId: String
        ) {
            guard model.draftStore.gridDraft?.clientId.rawValue == eventId else { return }
            model.setDraftTitle(title)
            view.update(state: model.timeGridState, theme: theme)
        }

        public func timeGridViewDidRequestTimeTravel(_ view: TimeGridView) {
            model.settingsStore.openTimezoneDialog(.timeTravel)
        }

        private func focusedEventLabel(for eventId: String) -> String? {
            let colWidths = model.timeGridState.resolvedColumnWidths()
            return model.timeGridState.snapshot(colWidths: colWidths).cards
                .first(where: { $0.eventId == eventId })?
                .label
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
