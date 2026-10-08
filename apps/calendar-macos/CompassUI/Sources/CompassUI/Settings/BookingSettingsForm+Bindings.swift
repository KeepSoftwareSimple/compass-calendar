import CompassData
import CompassKit
import SwiftUI

extension BookingSettingsForm {
    var slugBinding: Binding<String> {
        Binding(
            get: { self.slug ?? "" },
            set: { self.slug = $0.isEmpty ? nil : $0 }
        )
    }

    var weeklyBinding: Binding<[BookingPageWeeklyAvailability]> {
        Binding(
            get: { self.weeklyAvailability },
            set: { self.weeklyAvailability = $0 }
        )
    }

    var durationBinding: Binding<DurationMinutesEnum> {
        Binding(
            get: { self.durationMinutes },
            set: { self.durationMinutes = $0 }
        )
    }

    func destinationBinding(calendars: [CompassCalendar]) -> Binding<String> {
        Binding(
            get: { self.destinationCalendarId },
            set: { self.setDestinationCalendarId($0, calendars: calendars) }
        )
    }
}
