import CompassKit
import Foundation

extension CompassCalendar {
    init(listItem: CalendarListResponseCalendars) {
        self.init(
            access: listItem.access,
            accountEmail: listItem.accountEmail,
            backgroundColor: listItem.backgroundColor,
            capabilities: listItem.capabilities,
            conference: listItem.conference,
            createsGoogleMeet: listItem.createsGoogleMeet,
            description: listItem.description,
            foregroundColor: listItem.foregroundColor,
            id: listItem.id,
            isActive: listItem.isActive,
            isPrimary: listItem.isPrimary,
            isVisible: listItem.isVisible,
            name: listItem.name,
            provider: listItem.provider,
            timeZone: listItem.timeZone
        )
    }
}
