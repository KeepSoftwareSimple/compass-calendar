import Foundation

public protocol SessionStore: Sendable {
    func load() throws -> SessionTokens?
    func save(_ tokens: SessionTokens) throws
    func clear() throws
}

/// In-memory session store for tests and previews.
public final class MemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: SessionTokens?

    public init(tokens: SessionTokens? = nil) {
        self.tokens = tokens
    }

    public func load() throws -> SessionTokens? {
        lock.lock()
        defer { lock.unlock() }
        return tokens
    }

    public func save(_ tokens: SessionTokens) throws {
        lock.lock()
        defer { lock.unlock() }
        self.tokens = tokens
    }

    public func clear() throws {
        lock.lock()
        defer { lock.unlock() }
        tokens = nil
    }
}
