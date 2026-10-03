import CompassKit
import Foundation
import Observation

@MainActor
@Observable
public final class CommandPaletteStore {
    public var isOpen = false
    public var query = ""
    public private(set) var recentCommandIds: [String] = []
    public private(set) var statusAnnouncement = ""

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        recentCommandIds = RecentCommandsPersistence.read(from: defaults)
    }

    public func open(focusedQuery: String = "") {
        isOpen = true
        query = focusedQuery
    }

    public func close() {
        isOpen = false
        query = ""
    }

    public func toggle() {
        if isOpen { close() } else { open() }
    }

    public func recordSelection(commandId: String) {
        recentCommandIds = RecentCommandsPersistence.record(commandId, existing: recentCommandIds)
        RecentCommandsPersistence.write(recentCommandIds, to: defaults)
    }

    public func announce(_ text: String) {
        statusAnnouncement = text
    }

    public func consumeAnnouncement() {
        statusAnnouncement = ""
    }
}
