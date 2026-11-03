import CompassKit

enum EventDetailsEqualForUndo {
    static func matches(_ left: EventContent, _ right: EventContent) -> Bool {
        switch (left, right) {
        case (.busy, .busy):
            return true
        case let (.details(leftValue), .details(rightValue)):
            if leftValue.title != rightValue.title
                || leftValue.description != rightValue.description
            {
                return false
            }
            if (leftValue.location ?? "") != (rightValue.location ?? "") {
                return false
            }
            if leftValue.color != rightValue.color { return false }
            if leftValue.color != nil { return true }
            return leftValue.colorHex == rightValue.colorHex
        default:
            return false
        }
    }
}
