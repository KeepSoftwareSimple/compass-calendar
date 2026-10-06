// Mirrors `apps/calendar-web/src/events/stores/undo.store.ts` and
// `apps/calendar-web/src/events/mutations/event.mutation-history.ts`.

import CompassKit
import Foundation

public enum UndoHistoryEntry: Sendable, Equatable {
    case edit(id: EventId, before: Event, after: Event)
    case delete(event: Event)
    case create(event: Event)
    case hidden(eventId: EventId, hidden: Bool)
    case unrecorded
}

@MainActor
@Observable
public final class UndoStore {
    public static let maxHistory = 30

    public private(set) var past: [UndoHistoryEntry] = []
    public private(set) var future: [UndoHistoryEntry] = []

    private var restoring = false

    public init() {}

    public var canUndo: Bool { !past.isEmpty }
    public var canRedo: Bool { !future.isEmpty }

    public func isRestoringHistory() -> Bool { restoring }

    public func runHistoryRestore(_ work: () -> Void) {
        restoring = true
        defer { restoring = false }
        work()
    }

    public func runHistoryRestoreAsync(_ work: () async -> Void) async {
        restoring = true
        defer { restoring = false }
        await work()
    }

    /// Series-master edits have no client-computable inverse; never recorded.
    public static func isUndoableRecurrence(_ event: Event) -> Bool {
        switch event.recurrence {
        case .series:
            return false
        default:
            return true
        }
    }

    public func record(_ entry: UndoHistoryEntry) {
        guard !restoring else { return }
        if case .unrecorded = entry {
            if case .unrecorded? = past.last { return }
        }

        if case let .edit(_, before, after) = entry,
           !Self.isUndoableRecurrence(before) || !Self.isUndoableRecurrence(after)
        {
            return
        }

        if case let .edit(id, _, after) = entry,
           let top = past.last,
           case let .edit(topId, topBefore, _) = top,
           topId == id,
           future.isEmpty
        {
            past[past.count - 1] = .edit(id: id, before: topBefore, after: after)
            future = []
            return
        }

        past.append(entry)
        if past.count > Self.maxHistory {
            past.removeFirst(past.count - Self.maxHistory)
        }
        future = []
    }

    public func peekUndo() -> UndoHistoryEntry? { past.last }
    public func peekRedo() -> UndoHistoryEntry? { future.last }

    public func commitUndo() {
        guard let entry = past.popLast() else { return }
        future.append(entry)
    }

    public func commitRedo() {
        guard let entry = future.popLast() else { return }
        past.append(entry)
        if past.count > Self.maxHistory {
            past.removeFirst(past.count - Self.maxHistory)
        }
    }

    public func clear() {
        past = []
        future = []
    }
}
