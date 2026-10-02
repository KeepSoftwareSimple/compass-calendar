import Foundation

public enum HoldModifierPhase: Equatable, Sendable {
    case idle
    case pending
    case hintsVisible
}

/// Hold-to-reveal chips for Mod page jumps and hold-H event jumps.
public final class HoldModifierDetector: @unchecked Sendable {
    public static let defaultHoldMs: TimeInterval = 0.25

    public private(set) var phase: HoldModifierPhase = .idle

    private let holdKey: KeyToken
    private let holdMs: TimeInterval
    private let timer: DispatchTimer
    private var holdToken: DispatchTimerToken?
    private let onDigitDuringHold: (Character) -> Void

    public init(
        holdKey: KeyToken,
        holdMs: TimeInterval = HoldModifierDetector.defaultHoldMs,
        timer: DispatchTimer = DispatchTimer(),
        onDigitDuringHold: @escaping (Character) -> Void = { _ in }
    ) {
        self.holdKey = holdKey
        self.holdMs = holdMs
        self.timer = timer
        self.onDigitDuringHold = onDigitDuringHold
    }

    public func handleModifierDown(isRepeat: Bool = false) {
        guard !isRepeat else { return }
        guard phase == .idle else { return }
        phase = .pending
        holdToken = timer.schedule(after: holdMs) { [weak self] in
            guard let self else { return }
            if case .pending = self.phase {
                self.phase = .hintsVisible
            }
        }
    }

    public func handleModifierUp() {
        cancelHoldTimer()
        phase = .idle
    }

    public func handleKeyDown(_ event: KeyEvent) -> Bool {
        if matchesHoldKey(event), event.modifiers.isEmpty {
            handleModifierDown(isRepeat: event.isRepeat)
            return false
        }

        guard phase == .hintsVisible || phase == .pending else { return false }

        if case .character(let digit) = event.key, digit.isNumber {
            onDigitDuringHold(digit)
            hideHints()
            return true
        }

        cancelHoldTimer()
        if phase == .hintsVisible {
            phase = .idle
        }
        return false
    }

    public func advanceTime(by interval: TimeInterval) {
        timer.advance(by: interval)
    }

    public func reset() {
        cancelHoldTimer()
        phase = .idle
    }

    private func hideHints() {
        cancelHoldTimer()
        phase = .idle
    }

    private func cancelHoldTimer() {
        if let holdToken {
            timer.cancel(holdToken)
            self.holdToken = nil
        }
    }

    private func matchesHoldKey(_ event: KeyEvent) -> Bool {
        switch (holdKey, event.key) {
        case (.character(let hold), .character(let key)):
            return hold.lowercased() == key.lowercased()
        default:
            return event.key == holdKey && event.modifiers.isEmpty
        }
    }
}

public enum HoldModifierDetectorFactory {
    /// Mod-only hold detector (command modifier press, no other keys).
    public static func modHold(
        timer: DispatchTimer = DispatchTimer(),
        holdMs: TimeInterval = HoldModifierDetector.defaultHoldMs,
        onDigitDuringHold: @escaping (Character) -> Void
    ) -> ModHoldDetector {
        ModHoldDetector(timer: timer, holdMs: holdMs, onDigitDuringHold: onDigitDuringHold)
    }

    public static func eventJumpHold(
        timer: DispatchTimer = DispatchTimer(),
        onDigitDuringHold: @escaping (Character) -> Void
    ) -> HoldModifierDetector {
        HoldModifierDetector(
            holdKey: .character("h"),
            timer: timer,
            onDigitDuringHold: onDigitDuringHold)
    }
}

/// Tracks the platform Mod key (command on macOS) without a character key event.
public final class ModHoldDetector: @unchecked Sendable {
    public private(set) var phase: HoldModifierPhase = .idle

    private let holdMs: TimeInterval
    private let timer: DispatchTimer
    private var holdToken: DispatchTimerToken?
    private let onDigitDuringHold: (Character) -> Void

    public init(
        timer: DispatchTimer = DispatchTimer(),
        holdMs: TimeInterval = HoldModifierDetector.defaultHoldMs,
        onDigitDuringHold: @escaping (Character) -> Void
    ) {
        self.timer = timer
        self.holdMs = holdMs
        self.onDigitDuringHold = onDigitDuringHold
    }

    public func handleFlagsChanged(modifierDown: Bool, isRepeat: Bool = false) {
        if modifierDown {
            guard !isRepeat, phase == .idle else { return }
            phase = .pending
            holdToken = timer.schedule(after: holdMs) { [weak self] in
                guard let self else { return }
                if case .pending = self.phase {
                    self.phase = .hintsVisible
                }
            }
        } else {
            cancelHoldTimer()
            phase = .idle
        }
    }

    public func handleKeyDown(_ event: KeyEvent) -> Bool {
        guard event.modifiers.contains(.command), !event.modifiers.contains(.shift),
            !event.modifiers.contains(.option)
        else {
            cancelHoldTimer()
            if phase != .idle { phase = .idle }
            return false
        }

        guard phase == .hintsVisible || phase == .pending else { return false }

        if case .character(let digit) = event.key, digit.isNumber {
            onDigitDuringHold(digit)
            cancelHoldTimer()
            phase = .idle
            return true
        }
        return false
    }

    public func advanceTime(by interval: TimeInterval) {
        timer.advance(by: interval)
    }

    private func cancelHoldTimer() {
        if let holdToken {
            timer.cancel(holdToken)
            self.holdToken = nil
        }
    }
}
