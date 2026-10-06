import Foundation

public enum BlockPartyPhase: String, Sendable, Equatable {
    case howto, running, ended
}

public enum BlockPartyOutcome: String, Sendable, Equatable {
    case cleared, overtime
}

public enum BlockPartySimOverlay: String, Sendable, Equatable {
    case legend, pagejump, palette
}

public enum BlockPartyKey: Sendable, Equatable {
    case create
    case digit(String)
    case arrow(PracticeNudgeDirection, shift: Bool)
    case tab(backward: Bool)
    case enter
    case delete
    case undo
    case legend
    case palette
    case jump
    case letter(String)
    case modHoldReveal
    case modHoldEnd
    case pageJumpDigit(String)
    case closeOverlay
}

public struct BlockPartyAward: Equatable, Sendable {
    public var seq: Int
    public var points: Int
    public var taskId: String
    public var elapsedMs: Int
}

public struct BlockPartyBuzzer: Equatable, Sendable {
    public var score: Int
    public var tasksDone: Int
}

public struct BlockPartyState: Sendable, Equatable {
    public var phase: BlockPartyPhase
    public var outcome: BlockPartyOutcome?
    public var practice: PracticeState
    public var taskIndex: Int
    public var tasksDone: Int
    public var score: Int
    public var streak: Int
    public var timeBonus: Int
    public var digitBuffer: String
    public var startedAtMs: Int
    public var endsAtMs: Int
    public var endedAtMs: Int
    public var taskStartedAtMs: Int
    public var lastAward: BlockPartyAward?
    public var runCount: Int
    public var timed: Bool
    public var buzzer: BlockPartyBuzzer?
    public var tasksSkipped: Int
    public var simOverlay: BlockPartySimOverlay?
    public var simOverlayOpened: Bool
    public var jumpChipsShown: Bool
    public let runTasks: [BlockPartyTask]

    public func snapshot() -> BlockPartyStateSnapshot {
        BlockPartyStateSnapshot(
            phase: phase.rawValue,
            outcome: outcome?.rawValue,
            taskIndex: taskIndex,
            tasksDone: tasksDone,
            tasksSkipped: tasksSkipped,
            score: score,
            streak: streak,
            timeBonus: timeBonus,
            digitBuffer: digitBuffer,
            timed: timed,
            simOverlay: simOverlay?.rawValue,
            simOverlayOpened: simOverlayOpened,
            jumpChipsShown: jumpChipsShown,
            buzzer: buzzer.map { BlockPartyBuzzerSnapshot(score: $0.score, tasksDone: $0.tasksDone) },
            practice: BlockPartyPracticeSnapshot(
                focusedId: practice.focusedId,
                placingId: practice.placingId,
                edge: practice.edge?.rawValue,
                lastDeletedId: practice.lastDeleted?.id,
                events: practice.events
            )
        )
    }
}

public enum BlockPartyEngine {
    private static let jumpLetterPool = Array("asdfgjkl")

    public static func createInitialState(
        seedEvents: [PracticeEventBlock],
        runTasks: [BlockPartyTask],
        runCount: Int = 1,
        timed: Bool = false
    ) -> BlockPartyState {
        BlockPartyState(
            phase: .howto,
            outcome: nil,
            practice: PracticeStateEngine.create(events: seedEvents.map { $0 }),
            taskIndex: 0,
            tasksDone: 0,
            score: 0,
            streak: 0,
            timeBonus: 0,
            digitBuffer: "",
            startedAtMs: 0,
            endsAtMs: 0,
            endedAtMs: 0,
            taskStartedAtMs: 0,
            lastAward: nil,
            runCount: runCount,
            timed: timed,
            buzzer: nil,
            tasksSkipped: 0,
            simOverlay: nil,
            simOverlayOpened: false,
            jumpChipsShown: false,
            runTasks: runTasks
        )
    }

    public static func currentTask(_ state: BlockPartyState) -> BlockPartyTask? {
        guard state.taskIndex >= 0, state.taskIndex < state.runTasks.count else { return nil }
        return state.runTasks[state.taskIndex]
    }

    public static func startRun(_ state: BlockPartyState, nowMs: Int) -> BlockPartyState {
        guard state.phase == .howto else { return state }
        var next = state
        next.phase = .running
        next.startedAtMs = nowMs
        next.endsAtMs = state.timed ? nowMs + BlockPartyScoring.runDurationMs : 0
        next.taskStartedAtMs = nowMs
        return enterTask(next)
    }

    public static func tick(_ state: BlockPartyState, nowMs: Int) -> BlockPartyState {
        guard state.phase == .running, state.timed, state.buzzer == nil, nowMs >= state.endsAtMs else {
            return state
        }
        var next = state
        next.buzzer = BlockPartyBuzzer(score: state.score, tasksDone: state.tasksDone)
        return next
    }

    public static func skipCurrentTask(_ state: BlockPartyState, nowMs: Int) -> BlockPartyState {
        guard state.phase == .running, currentTask(state) != nil else { return state }
        var advanced = state
        advanced.taskIndex += 1
        advanced.tasksSkipped += 1
        advanced.streak = 0
        advanced.taskStartedAtMs = nowMs
        return advanceOrFinish(advanced, nowMs: nowMs, applyTimeBonus: false)
    }

    public static func handleKey(_ state: BlockPartyState, key: BlockPartyKey, nowMs: Int) -> BlockPartyState {
        guard state.phase == .running else { return state }
        let next = applyKey(state, key: key)
        guard next != state else { return state }
        return completeIfDone(next, nowMs: nowMs)
    }

    public static func parseKey(_ token: String) -> BlockPartyKey? {
        if token == "create" { return .create }
        if token == "enter" { return .enter }
        if token == "delete" { return .delete }
        if token == "undo" { return .undo }
        if token == "legend" { return .legend }
        if token == "palette" { return .palette }
        if token == "jump" { return .jump }
        if token == "modHoldReveal" { return .modHoldReveal }
        if token == "modHoldEnd" { return .modHoldEnd }
        if token == "closeOverlay" { return .closeOverlay }
        if token == "tab" { return .tab(backward: false) }
        if token == "tab:backward" { return .tab(backward: true) }
        if token.hasPrefix("digit:") {
            return .digit(String(token.dropFirst("digit:".count)))
        }
        if token.hasPrefix("letter:") {
            return .letter(String(token.dropFirst("letter:".count)))
        }
        if token.hasPrefix("pageJumpDigit:") {
            return .pageJumpDigit(String(token.dropFirst("pageJumpDigit:".count)))
        }
        if token.hasPrefix("arrow:") {
            let parts = token.split(separator: ":").map(String.init)
            guard let directionRaw = parts.dropFirst().first,
                  let direction = PracticeNudgeDirection(rawValue: directionRaw)
            else { return nil }
            let shift = parts.contains("shift")
            return .arrow(direction, shift: shift)
        }
        return nil
    }

    public static func getJumpLetters(practice: PracticeState) -> [String: String] {
        let ordered = practice.events.sorted {
            $0.dayIndex != $1.dayIndex
                ? $0.dayIndex < $1.dayIndex
                : $0.startMin != $1.startMin ? $0.startMin < $1.startMin : $0.id < $1.id
        }
        var letters: [String: String] = [:]
        for (index, event) in ordered.prefix(jumpLetterPool.count).enumerated() {
            letters[event.id] = String(jumpLetterPool[index])
        }
        return letters
    }

    public static func getDisplayKeycaps(task: BlockPartyTask, state: BlockPartyState) -> [String] {
        if task.type == "eventJump" {
            if let targetId = task.targetEventId,
               let letter = getJumpLetters(practice: state.practice)[targetId]
            {
                return task.keycaps + [letter.uppercased()]
            }
            return task.keycaps
        }
        if (task.type == "palette" && state.simOverlay == .palette)
            || (task.type == "legend" && state.simOverlay == .legend)
        {
            return ["Esc"]
        }
        return task.keycaps
    }

    public static func getTaskGhost(task: BlockPartyTask) -> BlockPartySlot? {
        task.target
    }

    public static func isTaskComplete(task: BlockPartyTask, state: BlockPartyState) -> Bool {
        switch task.type {
        case "place", "quickTime":
            guard let piece = task.piece else { return false }
            guard let block = blockById(state.practice, id: piece.id) else { return false }
            guard state.practice.placingId != piece.id else { return false }
            guard let target = task.target else { return false }
            return matchesSlot(block, target)
        case "nudge", "resize":
            guard let targetEventId = task.targetEventId, let target = task.target else { return false }
            guard let block = blockById(state.practice, id: targetEventId) else { return false }
            return matchesSlot(block, target)
        case "delete":
            guard let targetEventId = task.targetEventId else { return false }
            return blockById(state.practice, id: targetEventId) == nil
        case "undo":
            guard let targetEventId = task.targetEventId else { return false }
            return blockById(state.practice, id: targetEventId) != nil
        case "legend", "pageJump", "palette":
            return state.simOverlayOpened && state.simOverlay == nil
        case "eventJump":
            guard let targetEventId = task.targetEventId else { return false }
            return state.simOverlayOpened && !state.jumpChipsShown && state.practice.focusedId == targetEventId
        default:
            return false
        }
    }

    // MARK: - Private

    private static func enterTask(_ state: BlockPartyState) -> BlockPartyState {
        var next = state
        next.digitBuffer = ""
        next.simOverlay = nil
        next.simOverlayOpened = false
        next.jumpChipsShown = false
        guard let task = currentTask(state) else { return next }
        if let targetEventId = task.targetEventId,
           task.type != "undo",
           task.type != "eventJump"
        {
            next.practice = PracticeStateEngine.focusEvent(next.practice, id: targetEventId)
        }
        return next
    }

    private static func blockById(_ practice: PracticeState, id: String) -> PracticeEventBlock? {
        practice.events.first { $0.id == id }
    }

    private static func matchesSlot(_ block: PracticeEventBlock, _ slot: BlockPartySlot) -> Bool {
        block.dayIndex == slot.dayIndex && block.startMin == slot.startMin && block.endMin == slot.endMin
    }

    private static func applyKey(_ state: BlockPartyState, key: BlockPartyKey) -> BlockPartyState {
        guard let task = currentTask(state) else { return state }
        var next = state
        let practice = state.practice

        switch key {
        case .create:
            guard task.type == "place", let piece = task.piece, let spawn = task.spawn else { return state }
            if practice.placingId != nil || blockById(practice, id: piece.id) != nil { return state }
            var block = pieceToEvent(piece)
            block.dayIndex = spawn.dayIndex
            block.startMin = spawn.startMin
            block.endMin = spawn.endMin
            next.practice = PracticeStateEngine.spawnPiece(practice, piece: block)
        case .digit(let digit):
            guard task.type == "quickTime", let piece = task.piece else { return state }
            if practice.placingId != nil || blockById(practice, id: piece.id) != nil { return state }
            let buffer = state.digitBuffer + digit
            if let startMin = resolveTypedTime(buffer) {
                next = spawnTypedPiece(state, task: task, startMin: startMin)
            } else {
                next.digitBuffer = canBecomeValidTime(buffer) ? buffer : ""
            }
        case .arrow(let direction, let shift):
            if practice.placingId == nil && !shift { return state }
            let nudged = PracticeStateEngine.nudgeFocused(practice, direction: direction)
            guard nudged != practice else { return state }
            next.practice = nudged
        case .tab(let backward):
            if practice.placingId != nil { return state }
            next.practice = PracticeStateEngine.cycleEdgeFocus(
                practice,
                direction: backward ? .backward : .forward
            )
        case .enter:
            if practice.placingId != nil {
                next.practice = PracticeStateEngine.lockPlacing(practice)
            } else if task.type == "quickTime", !state.digitBuffer.isEmpty {
                guard let startMin = resolveTypedTimeEagerly(state.digitBuffer) else {
                    next.digitBuffer = ""
                    return next
                }
                next = spawnTypedPiece(state, task: task, startMin: startMin)
            } else {
                return state
            }
        case .delete:
            let deleted = PracticeStateEngine.deleteFocused(practice)
            guard deleted != practice else { return state }
            next.practice = deleted
        case .undo:
            let restored = PracticeStateEngine.undoDelete(practice)
            guard restored != practice else { return state }
            next.practice = restored
        case .legend:
            next = toggleDiscoveryOverlay(state, kind: .legend, task: task)
        case .palette:
            next = toggleDiscoveryOverlay(state, kind: .palette, task: task)
        case .jump:
            guard task.type == "eventJump" else { return state }
            next.jumpChipsShown = !state.jumpChipsShown
            next.simOverlayOpened = true
        case .letter(let letter):
            guard state.jumpChipsShown else { return state }
            let letters = getJumpLetters(practice: practice)
            guard let targetId = letters.first(where: { $0.value == letter })?.key else { return state }
            next.jumpChipsShown = false
            next.practice = PracticeStateEngine.focusEvent(practice, id: targetId)
        case .modHoldReveal:
            guard task.type == "pageJump", state.simOverlay == nil else { return state }
            next.simOverlay = .pagejump
            next.simOverlayOpened = true
        case .modHoldEnd:
            guard state.simOverlay == .pagejump else { return state }
            next.simOverlay = nil
            next.simOverlayOpened = false
        case .pageJumpDigit(let digit):
            guard state.simOverlay == .pagejump else { return state }
            guard digit == "1" || digit == "2" else { return state }
            next.simOverlay = nil
        case .closeOverlay:
            guard state.simOverlay != nil else { return state }
            if state.simOverlay == .pagejump {
                next.simOverlay = nil
                next.simOverlayOpened = false
            } else {
                next.simOverlay = nil
            }
        }
        return next
    }

    private static func toggleDiscoveryOverlay(
        _ state: BlockPartyState,
        kind: BlockPartySimOverlay,
        task: BlockPartyTask
    ) -> BlockPartyState {
        if state.simOverlay == kind {
            var next = state
            next.simOverlay = nil
            return next
        }
        guard task.type == kind.rawValue, state.simOverlay == nil else { return state }
        var next = state
        next.simOverlay = kind
        next.simOverlayOpened = true
        return next
    }

    private static func pieceToEvent(_ piece: BlockPartyPiece) -> PracticeEventBlock {
        PracticeEventBlock(
            id: piece.id,
            title: piece.title,
            dayIndex: 0,
            startMin: 0,
            endMin: 0,
            color: piece.color
        )
    }

    private static func spawnTypedPiece(
        _ state: BlockPartyState,
        task: BlockPartyTask,
        startMin: Int
    ) -> BlockPartyState {
        guard let piece = task.piece, let target = task.target else { return state }
        let duration = target.endMin - target.startMin
        let endMin = min(PracticeGridConstants.practiceGridEndMin, startMin + duration)
        var block = pieceToEvent(piece)
        block.dayIndex = target.dayIndex
        block.startMin = startMin
        block.endMin = endMin
        var next = state
        next.digitBuffer = ""
        next.practice = PracticeStateEngine.spawnPiece(state.practice, piece: block)
        return next
    }

    private static func timeFromParts(hour: Int, minute: Int) -> Int? {
        if minute >= 60 || minute % PracticeGridConstants.practiceNudgeMin != 0 { return nil }
        let startMin = hour * 60 + minute
        if startMin < PracticeGridConstants.practiceGridStartMin { return nil }
        if startMin + PracticeGridConstants.practiceNudgeMin > PracticeGridConstants.practiceGridEndMin {
            return nil
        }
        return startMin
    }

    public static func resolveTypedTime(_ buffer: String) -> Int? {
        if buffer.count == 4 {
            let hour = Int(buffer.prefix(2)) ?? -1
            let minute = Int(buffer.suffix(2)) ?? -1
            return timeFromParts(hour: hour, minute: minute)
        }
        if buffer.count == 3 {
            let hour = Int(buffer.prefix(1)) ?? -1
            let minute = Int(buffer.suffix(2)) ?? -1
            return timeFromParts(hour: hour, minute: minute)
        }
        return nil
    }

    public static func resolveTypedTimeEagerly(_ buffer: String) -> Int? {
        if buffer.count == 1 || buffer.count == 2 {
            let hour = Int(buffer) ?? -1
            return timeFromParts(hour: hour, minute: 0)
        }
        return resolveTypedTime(buffer)
    }

    private static func canBecomeValidTime(_ buffer: String) -> Bool {
        if buffer.isEmpty { return false }
        if resolveTypedTimeEagerly(buffer) != nil { return true }
        if buffer.count >= 4 { return false }
        for digit in 0 ... 9 {
            if canBecomeValidTime(buffer + String(digit)) { return true }
        }
        return false
    }

    private static func completeIfDone(_ state: BlockPartyState, nowMs: Int) -> BlockPartyState {
        guard let task = currentTask(state), isTaskComplete(task: task, state: state) else { return state }
        let elapsed = nowMs - state.taskStartedAtMs
        let scored = BlockPartyScoring.scorePlacement(priorStreak: state.streak, elapsedMs: elapsed)
        var advanced = state
        advanced.score += scored.points
        advanced.streak = scored.streak
        advanced.tasksDone += 1
        advanced.taskIndex += 1
        advanced.taskStartedAtMs = nowMs
        advanced.lastAward = BlockPartyAward(
            seq: (state.lastAward?.seq ?? 0) + 1,
            points: scored.points,
            taskId: task.id,
            elapsedMs: elapsed
        )
        return advanceOrFinish(advanced, nowMs: nowMs, applyTimeBonus: true)
    }

    private static func advanceOrFinish(
        _ state: BlockPartyState,
        nowMs: Int,
        applyTimeBonus: Bool
    ) -> BlockPartyState {
        if state.taskIndex >= state.runTasks.count {
            return finishRun(state, nowMs: nowMs, applyTimeBonus: applyTimeBonus)
        }
        return enterTask(state)
    }

    private static func finishRun(
        _ state: BlockPartyState,
        nowMs: Int,
        applyTimeBonus: Bool
    ) -> BlockPartyState {
        let fullClear =
            applyTimeBonus &&
            state.timed &&
            state.buzzer == nil &&
            state.tasksDone == state.runTasks.count
        let remainingSeconds = fullClear
            ? max(0, (state.endsAtMs - nowMs) / 1000)
            : 0
        let timeBonus = remainingSeconds * BlockPartyScoring.timeBonusPerSecond
        var next = state
        next.phase = .ended
        next.outcome = state.buzzer == nil ? .cleared : .overtime
        next.endedAtMs = nowMs
        if applyTimeBonus {
            next.timeBonus = timeBonus
            next.score += timeBonus
        }
        return next
    }
}
