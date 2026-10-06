import CompassKit
import Foundation

public enum BlockPartyShowcaseOutcome: String, Sendable {
    case finished, skipped
}

@MainActor
@Observable
public final class BlockPartyStore {
    public private(set) var isActive = false
    public var skipPending = false
    public private(set) var gameState: BlockPartyState
    public private(set) var hasSeenShowcase: Bool

    private let seedEvents: [PracticeEventBlock]
    private let runTasks: [BlockPartyTask]
    private let defaults: UserDefaults
    private let analytics: ProductAnalyticsClient

    public init(
        document: BlockPartyTasksDocument? = try? BlockPartyTasksCatalog.load(),
        defaults: UserDefaults = .standard,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient()
    ) {
        seedEvents = document?.seedEvents ?? []
        runTasks = document?.runTasks ?? []
        gameState = BlockPartyEngine.createInitialState(
            seedEvents: document?.seedEvents ?? [],
            runTasks: document?.runTasks ?? []
        )
        self.defaults = defaults
        self.analytics = analytics
        hasSeenShowcase = defaults.string(forKey: OnboardingStorageKeys.hasSeenShortcutShowcase) == "true"
    }

    public var isSurfaceEligible: Bool { isActive }

    public func replayFromPalette() {
        activate(entry: "palette")
    }

    public func startPracticeRun(nowMs: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        gameState = BlockPartyEngine.startRun(gameState, nowMs: nowMs)
    }

    public func replayTimedRun(nowMs: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        let nextRun = gameState.runCount + 1
        gameState = BlockPartyEngine.createInitialState(
            seedEvents: seedEvents,
            runTasks: runTasks,
            runCount: nextRun,
            timed: true
        )
        gameState = BlockPartyEngine.startRun(gameState, nowMs: nowMs)
    }

    public func handleKey(_ key: BlockPartyKey, nowMs: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        guard isActive else { return }
        if gameState.phase == .running {
            gameState = BlockPartyEngine.handleKey(gameState, key: key, nowMs: nowMs)
            if gameState.phase == .ended {
                analytics.track(
                    ProductEvent.shortcutShowcaseFinished,
                    properties: [
                        "outcome": .string(gameState.outcome?.rawValue ?? "cleared"),
                        "score": .int(gameState.score),
                        "tasks_done": .int(gameState.tasksDone),
                    ])
            }
            return
        }
        if gameState.phase == .howto, case .enter = key {
            startPracticeRun(nowMs: nowMs)
        }
    }

    public func tick(nowMs: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        guard isActive, gameState.phase == .running else { return }
        gameState = BlockPartyEngine.tick(gameState, nowMs: nowMs)
    }

    public func skipCurrentTask(nowMs: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        guard gameState.phase == .running else { return }
        gameState = BlockPartyEngine.skipCurrentTask(gameState, nowMs: nowMs)
        if gameState.phase == .ended {
            analytics.track(
                ProductEvent.shortcutShowcaseFinished,
                properties: [
                    "outcome": .string(gameState.outcome?.rawValue ?? "cleared"),
                    "score": .int(gameState.score),
                    "tasks_done": .int(gameState.tasksDone),
                ])
        }
    }

    public func requestSkip(exit: String = "calendar") {
        guard isActive else { return }
        if skipPending {
            skip(exit: exit)
        } else {
            skipPending = true
        }
    }

    public func clearSkipPending() {
        skipPending = false
    }

    public func skip(exit: String = "calendar") {
        guard isActive else { return }
        analytics.track(
            ProductEvent.shortcutShowcaseSkipped,
            properties: [
                "exit": .string(exit),
                "phase": .string(gameState.phase.rawValue),
                "tasks_done": .int(gameState.tasksDone),
            ])
        endShowcase(outcome: .skipped)
    }

    public func graduateFromEndScreen() {
        markSeen(outcome: .finished)
        close()
    }

    public func finishAfterEndScreen() {
        markSeen(outcome: .finished)
        close()
    }

    private func activate(entry: String) {
        resetGame()
        isActive = true
        skipPending = false
        defaults.set("in-progress", forKey: OnboardingStorageKeys.shortcutShowcaseStep)
        analytics.track(ProductEvent.shortcutShowcaseStarted, properties: ["entry": .string(entry)])
    }

    private func endShowcase(outcome: BlockPartyShowcaseOutcome) {
        markSeen(outcome: outcome)
        close()
    }

    private func markSeen(outcome: BlockPartyShowcaseOutcome) {
        defaults.set("true", forKey: OnboardingStorageKeys.hasSeenShortcutShowcase)
        defaults.set(outcome.rawValue, forKey: OnboardingStorageKeys.shortcutShowcaseOutcome)
        defaults.removeObject(forKey: OnboardingStorageKeys.shortcutShowcaseStep)
        hasSeenShowcase = true
    }

    private func close() {
        isActive = false
        skipPending = false
        resetGame()
    }

    private func resetGame() {
        gameState = BlockPartyEngine.createInitialState(
            seedEvents: seedEvents,
            runTasks: runTasks
        )
    }
}
