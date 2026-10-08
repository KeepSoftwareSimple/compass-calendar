import Foundation
import Observation

@MainActor
@Observable
public final class ShortcutsLegendStore {
    public var isOpen = false
    public var searchQuery = ""

    /// Fires when the legend opens or closes (AppKit mirror for XCUITest).
    public var onOpenChanged: ((Bool) -> Void)?

    public func open() {
        isOpen = true
        searchQuery = ""
        onOpenChanged?(true)
    }

    public func close() {
        isOpen = false
        searchQuery = ""
        onOpenChanged?(false)
    }

    public func toggle() {
        if isOpen { close() } else { open() }
    }
}
