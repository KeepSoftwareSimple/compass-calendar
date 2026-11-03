import Foundation

/// Mirrors `resolveBookingMeetingTypes` in packages/core. Pages saved before
/// meeting types derive one default type from `durationMinutes`.
///
/// The Mac edits type #1 through the Duration picker and sends no
/// `meetingTypes`, so the server keeps the other types and moves type #1.
public enum BookingMeetingTypesLogic {
    public static let defaultTypeId = "default"

    public static func defaultLabel(_ duration: DurationMinutesEnum) -> String {
        "\(duration.rawValue) min meeting"
    }

    public static func resolve(
        durationMinutes: DurationMinutesEnum,
        meetingTypes: [BookingPageMeetingTypes]?
    ) -> [BookingPageMeetingTypes] {
        if let meetingTypes, !meetingTypes.isEmpty { return meetingTypes }
        return [
            BookingPageMeetingTypes(
                durationMinutes: durationMinutes,
                id: defaultTypeId,
                label: defaultLabel(durationMinutes)
            ),
        ]
    }

    public static func resolve(_ page: AdminBookingPage?) -> [BookingPageMeetingTypes] {
        guard let page else { return [] }
        switch page {
        case let .saved(saved):
            return resolve(durationMinutes: saved.durationMinutes, meetingTypes: saved.meetingTypes)
        case let .setup(setup):
            return resolve(durationMinutes: setup.durationMinutes, meetingTypes: setup.meetingTypes)
        }
    }

    /// Read-only line under the Duration picker naming types #2 and #3.
    /// Nil on one-type pages so their layout is unchanged.
    public static func otherTypesSummary(_ types: [BookingPageMeetingTypes]) -> String? {
        let others = types.dropFirst()
        guard !others.isEmpty else { return nil }
        let list = others
            .map { "\($0.label) (\($0.durationMinutes.rawValue) min)" }
            .joined(separator: ", ")
        return "Also offered: \(list). Edit types on the web."
    }
}
