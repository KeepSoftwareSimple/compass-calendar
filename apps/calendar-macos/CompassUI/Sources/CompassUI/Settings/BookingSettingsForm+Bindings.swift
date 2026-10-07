import CompassData
import CompassKit
import SwiftUI

extension BookingSettingsForm {
    var slugBinding: Binding<String> {
        Binding(
            get: { slug ?? "" },
            set: { slug = $0.isEmpty ? nil : $0 }
        )
    }

    var weeklyBinding: Binding<[BookingPageWeeklyAvailability]> {
        Binding(
            get: { weeklyAvailability },
            set: { weeklyAvailability = $0 }
        )
    }

    var durationBinding: Binding<DurationMinutesEnum> {
        Binding(
            get: { durationMinutes },
            set: { durationMinutes = $0 }
        )
    }

    func destinationBinding(calendars: [CompassCalendar]) -> Binding<String> {
        Binding(
            get: { destinationCalendarId },
            set: { setDestinationCalendarId($0, calendars: calendars) }
        )
    }
}
