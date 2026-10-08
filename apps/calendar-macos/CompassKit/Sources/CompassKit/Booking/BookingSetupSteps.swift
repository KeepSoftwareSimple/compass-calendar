import Foundation

public enum BookingSetupStepId: String, Sendable, Hashable, CaseIterable {
    case address
    case hours
    case duration
    case destination
    case live
}

public enum BookingSetupSteps {
    public static let destinationZeroWritableSentence =
        "Connect a calendar you can write to before going live."

    public static func setupStepSentence(
        _ id: BookingSetupStepId,
        writableCalendarCount: Int
    ) -> String {
        if id == .destination, writableCalendarCount == 0 {
            return destinationZeroWritableSentence
        }
        return setupStepDefinition(id).sentence
    }

    public static func visibleSetupSteps(
        writableCalendarCount: Int
    ) -> [BookingSetupStepId] {
        var steps: [BookingSetupStepId] = [.address, .hours, .duration]
        if writableCalendarCount != 1 {
            steps.append(.destination)
        }
        steps.append(.live)
        return steps
    }

    public static func setupStepProgress(
        stepId: BookingSetupStepId,
        writableCalendarCount: Int
    ) -> (current: Int, total: Int) {
        let steps = visibleSetupSteps(writableCalendarCount: writableCalendarCount)
        let index = steps.firstIndex(of: stepId) ?? -1
        return (index + 1, steps.count)
    }

    public static func nextSetupStep(
        _ stepId: BookingSetupStepId,
        writableCalendarCount: Int
    ) -> BookingSetupStepId? {
        let steps = visibleSetupSteps(writableCalendarCount: writableCalendarCount)
        guard let index = steps.firstIndex(of: stepId),
              index >= 0,
              index < steps.count - 1
        else { return nil }
        return steps[index + 1]
    }

    public static func prevSetupStep(
        _ stepId: BookingSetupStepId,
        writableCalendarCount: Int
    ) -> BookingSetupStepId? {
        let steps = visibleSetupSteps(writableCalendarCount: writableCalendarCount)
        guard let index = steps.firstIndex(of: stepId), index > 0 else { return nil }
        return steps[index - 1]
    }

    private static func setupStepDefinition(_ id: BookingSetupStepId) -> (
        title: String,
        sentence: String
    ) {
        switch id {
        case .address:
            return (
                "Pick your address",
                "Choose the link people will use to book time with you. You can change it later."
            )
        case .hours:
            return (
                "When can people meet with you?",
                "Set the days and times you are available each week."
            )
        case .duration:
            return (
                "How long is a meeting?",
                "Pick a default length for bookings."
            )
        case .destination:
            return (
                "Where should meetings go?",
                "New meetings you accept are added to this calendar."
            )
        case .live:
            return (
                "Ready to go live",
                "Review your settings, then turn on your meeting page."
            )
        }
    }
}
