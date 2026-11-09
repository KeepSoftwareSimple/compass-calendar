// Mirrors `apps/calendar-web/src/events/stores/event-paste-preview.store.ts`.

import Foundation

@MainActor
@Observable
public final class PastePreviewStore {
    public private(set) var isActive = false

    public init() {}

    public func activate() {
        isActive = true
    }

    public func deactivate() {
        isActive = false
    }
}
