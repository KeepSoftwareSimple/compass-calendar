import CompassKit
import Foundation

/// Web `edge-focus-hint.parts.ts`: teach nudge keys while an edge is focused.
enum EdgeFocusHint {
    private static let modeAnnouncements: Set<String> = [
        "Editing start time",
        "Editing end time",
        "Editing whole event",
    ]

    static func statusText(
        edge: EventEdge?,
        isAllDay: Bool,
        announcement: String
    ) -> String {
        let movement = movementPhrase(edge: edge, isAllDay: isAllDay)
        let cycle = "Tab cycles target"
        if !announcement.isEmpty, !modeAnnouncements.contains(announcement) {
            return "\(announcement) · \(movement) · \(cycle)"
        }
        return "\(movement) · \(cycle)"
    }

    private static func movementPhrase(edge: EventEdge?, isAllDay: Bool) -> String {
        if edge == nil {
            return isAllDay
                ? "Shift+ArrowLeft/ArrowRight moves event"
                : "Shift+arrows moves event"
        }
        let noun: String
        switch edge {
        case .startDate:
            noun = isAllDay ? "start date" : "start"
        case .endDate:
            noun = isAllDay ? "end date" : "end"
        case .none:
            noun = "event"
        }
        if isAllDay {
            return "Shift+ArrowLeft/ArrowRight adjusts \(noun)"
        }
        return "Shift+ArrowUp/ArrowDown adjusts \(noun)"
    }
}
