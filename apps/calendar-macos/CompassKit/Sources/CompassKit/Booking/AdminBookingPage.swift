import Foundation

public enum AdminBookingPage: Sendable, Hashable {
    case saved(AdminGetBookingPageResponse)
    case setup(AdminGetBookingPageSetupResponse)

    public var isSaved: Bool {
        if case .saved = self { return true }
        return false
    }
}

public enum AdminBookingPageLogic {
    public static func isUnconfiguredPage(_ page: AdminBookingPage) -> Bool {
        if case let .setup(setup) = page { return !setup.isConfigured }
        return false
    }

    public static func isLivePage(_ page: AdminBookingPage?) -> Bool {
        guard case let .saved(saved) = page else { return false }
        return saved.enabled
    }

    public static func slugFromPage(_ page: AdminBookingPage) -> String {
        switch page {
        case let .saved(saved): saved.slug
        case let .setup(setup): setup.suggestedSlug
        }
    }

    public static func publicBookingURL(_ page: AdminBookingPage?) -> URL? {
        guard case let .saved(saved) = page else { return nil }
        return URL(string: saved.bookingUrl)
    }
}
