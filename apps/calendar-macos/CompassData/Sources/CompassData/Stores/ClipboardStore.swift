// Mirrors `apps/calendar-web/src/events/stores/event-clipboard.store.ts`.

import CompassKit
import Foundation

@MainActor
@Observable
public final class ClipboardStore {
    public private(set) var event: Event?

    public init(event: Event? = nil) {
        self.event = event
    }

    public func copy(_ event: Event) {
        self.event = event
    }

    public func clear() {
        event = nil
    }
}
