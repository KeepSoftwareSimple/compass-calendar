// Mirrors `apps/calendar-web/src/events/stores/event-paste-preview.store.ts`.

import Foundation

@MainActor
@Observable
public final class PastePreviewStore {
    public private(set) var isActive = false
  public private(set) var ownsEventJump = false

    public init() {}

    public func activate(ownsEventJump: Bool) {
        isActive = true
        self.ownsEventJump = ownsEventJump
    }

    public func deactivate() {
        isActive = false
        ownsEventJump = false
    }
}
