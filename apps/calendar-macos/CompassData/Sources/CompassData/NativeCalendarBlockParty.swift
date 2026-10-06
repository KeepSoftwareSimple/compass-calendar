import CompassKit
import Foundation

extension NativeCalendarRootModel {
    public func handleBlockPartyKeyDown(_ event: KeyEvent) -> Bool {
        guard blockPartyStore.isActive else { return false }

        if event.key == .named(.escape), event.modifiers.isEmpty {
            if blockPartyStore.gameState.simOverlay != nil {
                blockPartyStore.handleKey(.closeOverlay)
                return true
            }
            if blockPartyStore.gameState.phase == .running {
                blockPartyStore.skipCurrentTask()
                return true
            }
            blockPartyStore.requestSkip()
            return true
        }

        if blockPartyStore.gameState.phase == .howto {
            if event.key == .named(.enter), event.modifiers.isEmpty {
                blockPartyStore.handleKey(.enter)
                return true
            }
            return false
        }

        guard blockPartyStore.gameState.phase == .running else { return false }

        if let key = translateBlockPartyKey(event) {
            blockPartyStore.handleKey(key)
            return true
        }
        return false
    }

    public func handleBlockPartyFlagsChanged(commandDown: Bool) {
        guard blockPartyStore.isActive, blockPartyStore.gameState.phase == .running else { return }
        if commandDown {
            blockPartyModHoldTask?.cancel()
            blockPartyModHoldTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(600))
                guard !Task.isCancelled else { return }
                self?.blockPartyStore.handleKey(.modHoldReveal)
            }
        } else {
            blockPartyModHoldTask?.cancel()
            blockPartyModHoldTask = nil
            if blockPartyStore.gameState.simOverlay == .pagejump {
                blockPartyStore.handleKey(.modHoldEnd)
            }
        }
    }

    private func translateBlockPartyKey(_ event: KeyEvent) -> BlockPartyKey? {
        if event.modifiers == [.command], case .character(let char) = event.key, char.lowercased() == "k" {
            return .palette
        }
        if case .punctuation("/") = event.key, event.modifiers.contains(.shift) {
            return .legend
        }
        if event.modifiers.isEmpty, case .character(let char) = event.key {
            if char == "c" { return .create }
            if char == "h" { return .jump }
            if char == "?" { return .legend }
            if char.isNumber { return .digit(String(char)) }
            if char.isLetter { return .letter(String(char)) }
        }
        if event.modifiers.contains(.command), case .character(let char) = event.key, char.lowercased() == "z" {
            return .undo
        }
        if event.key == .named(.enter), event.modifiers.isEmpty { return .enter }
        if event.key == .named(.delete) || event.key == .named(.deleteForward) { return .delete }
        if event.key == .named(.tab) {
            return .tab(backward: event.modifiers.contains(.shift))
        }
        if event.modifiers.contains(.command), case .character(let char) = event.key, char == "1" || char == "2" {
            return .pageJumpDigit(String(char))
        }

        let shift = event.modifiers.contains(.shift)
        switch event.key {
        case .named(.arrowUp): return .arrow(.up, shift: shift)
        case .named(.arrowDown): return .arrow(.down, shift: shift)
        case .named(.arrowLeft): return .arrow(.left, shift: shift)
        case .named(.arrowRight): return .arrow(.right, shift: shift)
        default: return nil
        }
    }
}
