import Foundation

public enum LeaderSequencePhase: Equatable, Sendable {
    case idle
    case armedSilent
    case armedWithMenu
    case resolved(field: String)
}

/// `e` leader state machine: silent arm window, then which-key menu, then resolve.
public final class LeaderSequenceEngine: @unchecked Sendable {
    public static let defaultArmWindowMs: TimeInterval = 0.6

    public private(set) var phase: LeaderSequencePhase = .idle
    public let leaderKey: Character
    public let fieldRows: [ShortcutRegistry.EditSequenceFieldRow]

    private let timer: DispatchTimer
    private let armWindowMs: TimeInterval
    private var armToken: DispatchTimerToken?

    public init(
        leaderKey: Character,
        fieldRows: [ShortcutRegistry.EditSequenceFieldRow],
        timer: DispatchTimer = DispatchTimer(),
        armWindowMs: TimeInterval = LeaderSequenceEngine.defaultArmWindowMs
    ) {
        self.leaderKey = leaderKey
        self.fieldRows = fieldRows
        self.timer = timer
        self.armWindowMs = armWindowMs
    }

    public var whichKeyRows: [ShortcutRegistry.EditSequenceFieldRow] {
        fieldRows.filter { $0.secondKey != nil }
    }

    public func disarm() {
        if let armToken {
            timer.cancel(armToken)
            self.armToken = nil
        }
        phase = .idle
    }

    public func handleKeyDown(_ event: KeyEvent) -> LeaderSequencePhase {
        if case .armedSilent = phase, event.matches(KeyChord(token: .named(.escape))) {
            disarm()
            return phase
        }
        if case .armedWithMenu = phase, event.matches(KeyChord(token: .named(.escape))) {
            disarm()
            return phase
        }

        if case .armedSilent = phase, !event.modifiers.isEmpty {
            disarm()
            return phase
        }
        if case .armedWithMenu = phase, !event.modifiers.isEmpty {
            disarm()
            return phase
        }

        if case .idle = phase {
            if isLeaderPress(event) {
                arm()
            }
            return phase
        }

        guard case .character(let second) = event.key else {
            disarm()
            return phase
        }

        if let row = fieldRows.first(where: { $0.secondKey?.lowercased() == second.lowercased() }) {
            if let armToken {
                timer.cancel(armToken)
                self.armToken = nil
            }
            phase = .resolved(field: row.field)
            return phase
        }

        disarm()
        return phase
    }

    public func advanceTime(by interval: TimeInterval) {
        timer.advance(by: interval)
    }

    private func arm() {
        disarm()
        phase = .armedSilent
        armToken = timer.schedule(after: armWindowMs) { [weak self] in
            guard let self else { return }
            if case .armedSilent = self.phase {
                self.phase = .armedWithMenu
            }
        }
    }

    private func isLeaderPress(_ event: KeyEvent) -> Bool {
        guard event.modifiers.isEmpty else { return false }
        guard case .character(let character) = event.key else { return false }
        return character.lowercased() == leaderKey.lowercased()
    }
}

private extension Character {
    var lowercased: Character {
        Character(String(self).lowercased())
    }
}
