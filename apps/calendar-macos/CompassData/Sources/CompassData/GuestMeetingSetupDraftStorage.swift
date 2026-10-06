import CompassKit
import Foundation

public enum GuestMeetingSetupDraftStorage {
    private static let key = "guest_meeting_setup_draft"

    public static func read() -> AdminPutBookingPageInput? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(AdminPutBookingPageInput.self, from: data)
    }

    public static func write(_ draft: AdminPutBookingPageInput) {
        guard let data = try? JSONEncoder().encode(draft) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    public static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
