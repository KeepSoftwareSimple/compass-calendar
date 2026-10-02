import Foundation

public struct ShortcutLevelDefinition: Hashable, Sendable {
    public let level: Int
    public let name: String
    public let minUsed: Int

    public init(level: Int, name: String, minUsed: Int) {
        self.level = level
        self.name = name
        self.minUsed = minUsed
    }
}

public struct ShortcutLevelSnapshot: Hashable, Sendable {
    public let level: Int
    public let name: String
    public let used: Int
    public let total: Int
    public let nextName: String?
    public let remaining: Int?

    public init(
        level: Int,
        name: String,
        used: Int,
        total: Int,
        nextName: String?,
        remaining: Int?
    ) {
        self.level = level
        self.name = name
        self.used = used
        self.total = total
        self.nextName = nextName
        self.remaining = remaining
    }
}

public enum ShortcutLevelMath {
    public static func compute(
        usedIds: Set<String>,
        registryIds: [String],
        levels: [ShortcutLevelDefinition]
    ) -> ShortcutLevelSnapshot {
        let used = registryIds.filter { usedIds.contains($0) }.count
        guard let first = levels.first else {
            return ShortcutLevelSnapshot(
                level: 1,
                name: "Newcomer",
                used: used,
                total: registryIds.count,
                nextName: nil,
                remaining: nil)
        }

        let current = levels.reduce(first) { winner, definition in
            definition.minUsed <= used ? definition : winner
        }
        let next = levels.first { $0.minUsed > used }

        return ShortcutLevelSnapshot(
            level: current.level,
            name: current.name,
            used: used,
            total: registryIds.count,
            nextName: next?.name,
            remaining: next.map { $0.minUsed - used })
    }
}
