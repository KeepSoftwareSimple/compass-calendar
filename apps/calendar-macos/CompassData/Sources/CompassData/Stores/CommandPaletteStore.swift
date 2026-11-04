import CompassKit
import Foundation
import Observation

@MainActor
@Observable
public final class CommandPaletteStore {
    public var isOpen = false
    public var query = "" {
        didSet { if query != oldValue { selectedCommandId = nil } }
    }
    public private(set) var selectedCommandId: String?
    public private(set) var recentCommandIds: [String] = []
    public private(set) var statusAnnouncement = ""
    public var onAnnouncementChanged: ((String) -> Void)?

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        recentCommandIds = RecentCommandsPersistence.read(from: defaults)
    }

    public func open(focusedQuery: String = "") {
        isOpen = true
        selectedCommandId = nil
        query = focusedQuery
    }

    public func close() {
        isOpen = false
        selectedCommandId = nil
        query = ""
    }

    public func toggle() {
        if isOpen { close() } else { open() }
    }

    public func select(commandId: String?) {
        selectedCommandId = commandId
    }

    public func recordSelection(commandId: String) {
        recentCommandIds = RecentCommandsPersistence.record(commandId, existing: recentCommandIds)
        RecentCommandsPersistence.write(recentCommandIds, to: defaults)
    }

    public func announce(_ text: String) {
        statusAnnouncement = text
        onAnnouncementChanged?(text)
    }

    public func consumeAnnouncement() {
        statusAnnouncement = ""
    }
}
