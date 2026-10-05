import Foundation
import Observation

@MainActor
@Observable
public final class ShortcutsLegendStore {
    public var isOpen = false
    public var searchQuery = ""

    public func open() {
        isOpen = true
        searchQuery = ""
    }

    public func close() {
        isOpen = false
        searchQuery = ""
    }

    public func toggle() {
        if isOpen { close() } else { open() }
    }
}
