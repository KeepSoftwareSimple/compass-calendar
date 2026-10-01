import Foundation

public enum WebLoadPresentation: Equatable, Sendable {
    case app
    case offline
}

public enum WebLoadEvent: Equatable, Sendable {
    case appLoadFailed
    case appLoadSucceeded
    case userRequestedRetry
    case networkBecameReachable
}

public enum WebLoadAction: Equatable, Sendable {
    case showOfflinePage
    case loadAppURL
}

/// Pure state machine for main-frame load failures and offline recovery.
public struct WebLoadStateMachine: Equatable, Sendable {
    public private(set) var presentation: WebLoadPresentation

    public init(presentation: WebLoadPresentation = .app) {
        self.presentation = presentation
    }

    public mutating func handle(_ event: WebLoadEvent) -> [WebLoadAction] {
        switch (presentation, event) {
        case (.app, .appLoadFailed):
            presentation = .offline
            return [.showOfflinePage]
        case (.offline, .appLoadSucceeded):
            presentation = .app
            return []
        case (.app, .appLoadSucceeded):
            return []
        case (.offline, .userRequestedRetry):
            return [.loadAppURL]
        case (.offline, .networkBecameReachable):
            return [.loadAppURL]
        case (.offline, .appLoadFailed):
            return []
        case (.app, .userRequestedRetry):
            return [.loadAppURL]
        case (.app, .networkBecameReachable):
            return []
        }
    }
}

public enum OfflineRetryLink {
    public static let url = URL(string: "compass-offline://retry")!
}
