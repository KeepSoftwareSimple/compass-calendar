import Foundation

public struct ShortcutHandler: Sendable {
    public let id: ShortcutId
    public let scope: ShortcutScope
    public let chords: [KeyChord]
    public let handler: @Sendable (ShortcutId) -> Void

    public init(
        id: ShortcutId,
        scope: ShortcutScope,
        chords: [KeyChord],
        handler: @escaping @Sendable (ShortcutId) -> Void
    ) {
        self.id = id
        self.scope = scope
        self.chords = chords
        self.handler = handler
    }
}

/// Scope stack (`modal > form > grid > global`) with text-input gating.
public final class ShortcutDispatcher: @unchecked Sendable {
    public private(set) var scopeStack: [ShortcutScope] = [.global]
    public var isTextInputFocused = false

    public let registry: ShortcutRegistry
    public let leaderEngine: LeaderSequenceEngine

    private var handlers: [ShortcutHandler] = []
    private var dispatched: [ShortcutId] = []

    public init(registry: ShortcutRegistry) throws {
        self.registry = registry
        leaderEngine = LeaderSequenceEngine(
            leaderKey: registry.editSequenceLeader,
            fieldRows: registry.editSequenceFields)
        handlers = registry.entries.map { entry in
            ShortcutHandler(
                id: entry.id,
                scope: .global,
                chords: entry.bindingChords,
                handler: { _ in })
        }
    }

    public init(
        registry: ShortcutRegistry,
        handlers: [ShortcutHandler],
        leaderEngine: LeaderSequenceEngine
    ) {
        self.registry = registry
        self.handlers = handlers
        self.leaderEngine = leaderEngine
    }

    public func pushScope(_ scope: ShortcutScope) {
        scopeStack.append(scope)
    }

    @discardableResult
    public func popScope(_ scope: ShortcutScope) -> Bool {
        guard let index = scopeStack.lastIndex(of: scope) else { return false }
        scopeStack.remove(at: index)
        return true
    }

    public var activeScope: ShortcutScope {
        scopeStack.max() ?? .global
    }

    @discardableResult
    public func dispatch(_ event: KeyEvent) -> ShortcutId? {
        let leaderActive: Bool = {
            switch leaderEngine.phase {
            case .idle:
                return false
            default:
                return true
            }
        }()
        if isTextInputFocused,
            !leaderActive,
            !TextInputShortcutGating.shouldDispatch(event, leaderKey: registry.editSequenceLeader)
        {
            return nil
        }

        _ = leaderEngine.handleKeyDown(event)
        if case .resolved = leaderEngine.phase {
            leaderEngine.disarm()
        }

        let scopesInPlay = Set(scopeStack)
        let candidates = handlers
            .filter { scopesInPlay.contains($0.scope) }
            .sorted { $0.scope > $1.scope }

        for candidate in candidates {
            if candidate.chords.contains(where: { event.matches($0) }) {
                candidate.handler(candidate.id)
                dispatched.append(candidate.id)
                return candidate.id
            }
        }
        return nil
    }

    public var dispatchedShortcutIds: [ShortcutId] {
        dispatched
    }
}
