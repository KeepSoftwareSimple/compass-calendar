import Foundation

public struct BlockPartySlot: Hashable, Sendable, Codable {
    public var dayIndex: Int
    public var startMin: Int
    public var endMin: Int
}

public struct BlockPartyPiece: Hashable, Sendable, Codable {
    public var id: String
    public var title: String
    public var color: String?
}

public struct BlockPartyTask: Hashable, Sendable, Codable, Identifiable {
    public var id: String
    public var type: String
    public var title: String
    public var instruction: String
    public var hint: String
    public var keycaps: [String]
    public var piece: BlockPartyPiece?
    public var spawn: BlockPartySlot?
    public var target: BlockPartySlot?
    public var targetEventId: String?
    public var edge: String?
}

public struct BlockPartyTasksDocument: Sendable {
    public let seedEvents: [PracticeEventBlock]
    public let runTasks: [BlockPartyTask]
    public let cases: [BlockPartyReplayCase]
}

public struct BlockPartyReplayCase: Sendable {
    public let id: String
    public let taskId: String?
    public let keys: [String]
    public let nowMs: Int
    public let output: BlockPartyStateSnapshot
}

public struct BlockPartyStateSnapshot: Sendable, Equatable {
    public var phase: String
    public var outcome: String?
    public var taskIndex: Int
    public var tasksDone: Int
    public var tasksSkipped: Int
    public var score: Int
    public var streak: Int
    public var timeBonus: Int
    public var digitBuffer: String
    public var timed: Bool
    public var simOverlay: String?
    public var simOverlayOpened: Bool
    public var jumpChipsShown: Bool
    public var buzzer: BlockPartyBuzzerSnapshot?
    public var practice: BlockPartyPracticeSnapshot
}

public struct BlockPartyBuzzerSnapshot: Equatable, Sendable {
    public var score: Int
    public var tasksDone: Int
}

public struct BlockPartyPracticeSnapshot: Equatable, Sendable {
    public var focusedId: String?
    public var placingId: String?
    public var edge: String?
    public var lastDeletedId: String?
    public var events: [PracticeEventBlock]
}

public enum BlockPartyTasksCatalog {
    public static let stuckSkipHint =
        "Still stuck? Esc skips this task and the run keeps going."

    public static func load(bundle: Bundle = CompassKitResourceBundle.resources) throws -> BlockPartyTasksDocument {
        let url =
            bundle.url(forResource: "block-party.tasks", withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: "block-party.tasks", withExtension: "json", subdirectory: "Resources/Fixtures")
            ?? bundle.url(forResource: "block-party.tasks", withExtension: "json")
        guard let url else { throw BlockPartyTasksCatalogError.missingResource }
        let data = try Data(contentsOf: url)
        let decoded = try JSONDecoder().decode(Root.self, from: data)
        return BlockPartyTasksDocument(
            seedEvents: decoded.seedEvents,
            runTasks: decoded.runTasks,
            cases: decoded.cases.map { row in
                BlockPartyReplayCase(
                    id: row.id,
                    taskId: row.taskId,
                    keys: row.keys,
                    nowMs: row.nowMs,
                    output: row.output.toSnapshot()
                )
            }
        )
    }

    public enum BlockPartyTasksCatalogError: Error, Sendable {
        case missingResource
    }

    private struct Root: Decodable {
        var seedEvents: [PracticeEventBlock]
        var runTasks: [BlockPartyTask]
        var cases: [CaseRow]
    }

    private struct CaseRow: Decodable {
        var id: String
        var taskId: String?
        var keys: [String]
        var nowMs: Int
        var output: OutputRow
    }

    private struct OutputRow: Decodable {
        var phase: String
        var outcome: String?
        var taskIndex: Int
        var tasksDone: Int
        var tasksSkipped: Int
        var score: Int
        var streak: Int
        var timeBonus: Int
        var digitBuffer: String
        var timed: Bool
        var simOverlay: String?
        var simOverlayOpened: Bool
        var jumpChipsShown: Bool
        var buzzer: BuzzerRow?
        var practice: PracticeRow

        func toSnapshot() -> BlockPartyStateSnapshot {
            BlockPartyStateSnapshot(
                phase: phase,
                outcome: outcome,
                taskIndex: taskIndex,
                tasksDone: tasksDone,
                tasksSkipped: tasksSkipped,
                score: score,
                streak: streak,
                timeBonus: timeBonus,
                digitBuffer: digitBuffer,
                timed: timed,
                simOverlay: simOverlay,
                simOverlayOpened: simOverlayOpened,
                jumpChipsShown: jumpChipsShown,
                buzzer: buzzer.map { BlockPartyBuzzerSnapshot(score: $0.score, tasksDone: $0.tasksDone) },
                practice: BlockPartyPracticeSnapshot(
                    focusedId: practice.focusedId,
                    placingId: practice.placingId,
                    edge: practice.edge,
                    lastDeletedId: practice.lastDeletedId,
                    events: practice.events
                )
            )
        }
    }

    private struct BuzzerRow: Decodable {
        var score: Int
        var tasksDone: Int
    }

    private struct PracticeRow: Decodable {
        var focusedId: String?
        var placingId: String?
        var edge: String?
        var lastDeletedId: String?
        var events: [PracticeEventBlock]
    }
}
