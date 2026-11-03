import Foundation
import XCTest
@testable import CompassKit

private final class LockedBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T

    init(_ value: T) {
        self.value = value
    }

    func withLock<R>(_ body: (inout T) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

final class KeyboardEngineTests: XCTestCase {
    private var registry: ShortcutRegistry!

    override func setUpWithError() throws {
        try super.setUpWithError()
        registry = try ShortcutRegistry()
    }

    func testEveryRegistryBindingStringParses() throws {
        let url = try XCTUnwrap(
            CompassKitResourceBundle.resources.url(
                forResource: "shortcuts",
                withExtension: "json",
                subdirectory: "Resources"))
        let document = try JSONDecoder().decode(ShortcutsDocument.self, from: Data(contentsOf: url))

        for row in document.registry {
            for key in row.keys {
                XCTAssertNoThrow(try KeyChordParser.parseRegistryToken(key), row.id)
            }
        }

        for (id, keycaps) in document.bindings {
            for token in keycaps {
                XCTAssertNoThrow(try KeyChordParser.parseRegistryToken(token), id)
            }
            XCTAssertNoThrow(try KeyChordParser.parseKeycapAlternatives(keycaps), id)
        }

        func walkKeymap(_ value: Any, path: String = "keymap") {
            if let string = value as? String {
                if path.contains("hotkey") || path.hasSuffix("leader") || path.hasSuffix("bareLetter") {
                    XCTAssertNoThrow(try KeyChordParser.parseHotkey(string), path)
                }
                return
            }
            if let dict = value as? [String: Any] {
                for (key, nested) in dict {
                    walkKeymap(nested, path: "\(path).\(key)")
                }
            }
        }
        let keymapObject = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        walkKeymap(keymapObject?["keymap"] as Any)
    }

    func testShortcutIdRegistryParity() throws {
        let registryIds = registry.registryIds
        XCTAssertEqual(Set(ShortcutId.allCases), registryIds)
        for entry in registry.entries {
            XCTAssertFalse(entry.bindingChords.isEmpty, entry.id.rawValue)
        }
    }

    func testKeyChordHotkeyParsing() throws {
        let redo = try KeyChordParser.parseHotkey("Mod+Shift+Z")
        XCTAssertTrue(redo.modifiers.contains(.command))
        XCTAssertTrue(redo.modifiers.contains(.shift))
        if case .character(let letter) = redo.token {
            XCTAssertEqual(letter, "z")
        } else {
            XCTFail("expected letter")
        }

        let arrow = try KeyChordParser.parseHotkey("ArrowUp")
        XCTAssertEqual(arrow.token, .named(.arrowUp))

        let page = try KeyChordParser.parseHotkey("PageDown")
        XCTAssertEqual(page.token, .named(.pageDown))
    }

    func testMonthChordsMatchModAltJK() throws {
        let dispatcher = try ShortcutDispatcher(registry: registry)
        let modifiers: KeyModifiers = [.command, .option]
        XCTAssertEqual(
            dispatcher.dispatch(KeyEvent(key: .character("j"), modifiers: modifiers)),
            .navMonthPrev)
        XCTAssertEqual(
            dispatcher.dispatch(KeyEvent(key: .character("k"), modifiers: modifiers)),
            .navMonthNext)
        XCTAssertEqual(
            dispatcher.dispatch(KeyEvent(key: .character("t"), modifiers: modifiers)),
            .navMonthCurrent)
        XCTAssertNotEqual(
            dispatcher.dispatch(KeyEvent(key: .character("j"), modifiers: [.command, .shift])),
            .navMonthPrev)
    }

    func testToggleAllDayChordMatchModAltA() throws {
        let dispatcher = try ShortcutDispatcher(registry: registry)
        let modifiers: KeyModifiers = [.command, .option]
        XCTAssertEqual(
            dispatcher.dispatch(KeyEvent(key: .character("a"), modifiers: modifiers)),
            .editToggleAllDay)
        XCTAssertEqual(
            dispatcher.dispatch(KeyEvent(key: .character("A"), modifiers: modifiers)),
            .editToggleAllDay)
    }

    func testScopePrecedence() throws {
        let fired = LockedBox<ShortcutId?>(nil)
        let gridHandler = ShortcutHandler(
            id: .navNext,
            scope: .grid,
            chords: [KeyChord(token: .character("k"))],
            handler: { id in fired.withLock { $0 = id } })
        let modalHandler = ShortcutHandler(
            id: .editOpen,
            scope: .modal,
            chords: [KeyChord(token: .character("k"))],
            handler: { id in fired.withLock { $0 = id } })

        let leader = LeaderSequenceEngine(leaderKey: "e", fieldRows: registry.editSequenceFields)
        let dispatcher = ShortcutDispatcher(
            registry: registry,
            handlers: [gridHandler, modalHandler],
            leaderEngine: leader)

        dispatcher.pushScope(.grid)
        _ = dispatcher.dispatch(KeyEvent(character: "k"))
        XCTAssertEqual(fired.withLock { $0 }, .navNext)

        fired.withLock { $0 = nil }
        dispatcher.pushScope(.modal)
        _ = dispatcher.dispatch(KeyEvent(character: "k"))
        XCTAssertEqual(fired.withLock { $0 }, .editOpen)
    }

    func testTextInputGatingTable() {
        XCTAssertFalse(TextInputShortcutGating.shouldDispatch(KeyEvent(character: "c")))
        XCTAssertTrue(TextInputShortcutGating.shouldDispatch(KeyEvent(character: "z", modifiers: .command)))
        XCTAssertTrue(TextInputShortcutGating.shouldDispatch(KeyEvent(named: .escape)))
        XCTAssertTrue(TextInputShortcutGating.shouldDispatch(KeyEvent(named: .enter)))
        XCTAssertFalse(TextInputShortcutGating.shouldDispatch(KeyEvent(character: "e")))
    }

    /// Typing "Quarterly" in the form title must not arm `e` and jump to recurrence on `r`.
    func testTypingLeaderLetterInTextInputDoesNotResolveAField() {
        let leader = LeaderSequenceEngine(leaderKey: "e", fieldRows: registry.editSequenceFields)
        let dispatcher = ShortcutDispatcher(registry: registry, handlers: [], leaderEngine: leader)
        dispatcher.isTextInputFocused = true
        for character in "Quarterly review" where character != " " {
            _ = dispatcher.dispatch(KeyEvent(character: character))
            XCTAssertNil(dispatcher.lastResolvedLeaderField, "\(character) resolved a field jump")
        }
        XCTAssertEqual(leader.phase, .idle)
    }

    func testResolvedLeaderFieldDoesNotAlsoDispatchToday() {
        let fired = LockedBox<ShortcutId?>(nil)
        let today = ShortcutHandler(
            id: .navToday, scope: .grid,
            chords: [KeyChord(token: .character("t"))],
            handler: { id in fired.withLock { $0 = id } })
        let leader = LeaderSequenceEngine(leaderKey: "e", fieldRows: registry.editSequenceFields)
        let dispatcher = ShortcutDispatcher(registry: registry, handlers: [today], leaderEngine: leader)
        dispatcher.pushScope(.grid)

        XCTAssertNil(dispatcher.dispatch(KeyEvent(character: "e")))
        XCTAssertNil(dispatcher.dispatch(KeyEvent(character: "t")))
        XCTAssertEqual(dispatcher.lastResolvedLeaderField, "title")
        XCTAssertNil(fired.withLock { $0 })
        XCTAssertTrue(dispatcher.dispatchedShortcutIds.isEmpty)

        XCTAssertEqual(dispatcher.dispatch(KeyEvent(character: "t")), .navToday)
        XCTAssertNil(dispatcher.lastResolvedLeaderField)
        XCTAssertEqual(fired.withLock { $0 }, .navToday)
    }

    func testLeaderSequenceTimeoutAndResolve() {
        let timer = DispatchTimer()
        let engine = LeaderSequenceEngine(
            leaderKey: "e",
            fieldRows: registry.editSequenceFields,
            timer: timer,
            armWindowMs: 0.6)

        _ = engine.handleKeyDown(KeyEvent(character: "e"))
        XCTAssertEqual(engine.phase, .armedSilent)

        engine.advanceTime(by: 0.59)
        XCTAssertEqual(engine.phase, .armedSilent)

        engine.advanceTime(by: 0.02)
        XCTAssertEqual(engine.phase, .armedWithMenu)
        XCTAssertEqual(engine.whichKeyRows.count, 10)

        _ = engine.handleKeyDown(KeyEvent(character: "t"))
        if case .resolved(let field) = engine.phase {
            XCTAssertEqual(field, "title")
        } else {
            XCTFail("expected resolved title")
        }
    }

    func testLeaderSequenceRespectsFieldVisibility() {
        let timer = DispatchTimer()
        let engine = LeaderSequenceEngine(
            leaderKey: "e",
            fieldRows: registry.editSequenceFields,
            timer: timer,
            armWindowMs: 0.6)
        engine.isFieldVisible = { $0 != "rsvp" && $0 != "conference" }
        engine.canArm = { true }

        _ = engine.handleKeyDown(KeyEvent(character: "e"))
        engine.advanceTime(by: 0.61)
        XCTAssertFalse(engine.whichKeyRows.contains { $0.field == "rsvp" })

        _ = engine.handleKeyDown(KeyEvent(character: "g"))
        if case .resolved = engine.phase {
            XCTFail("hidden rsvp should not resolve")
        }
        XCTAssertEqual(engine.phase, .idle)

        engine.isFieldVisible = { $0 == "title" }
        _ = engine.handleKeyDown(KeyEvent(character: "e"))
        engine.advanceTime(by: 0.61)
        XCTAssertEqual(engine.whichKeyRows.count, 1)
    }

    func testLeaderSequenceDoesNotArmWhenCanArmFalse() {
        let engine = LeaderSequenceEngine(
            leaderKey: "e",
            fieldRows: registry.editSequenceFields)
        engine.canArm = { false }
        _ = engine.handleKeyDown(KeyEvent(character: "e"))
        XCTAssertEqual(engine.phase, .idle)
    }

    func testHoldModifierDetection() {
        let timer = DispatchTimer()
        var digits: [Character] = []
        let modHold = HoldModifierDetectorFactory.modHold(timer: timer) { digit in
            digits.append(digit)
        }

        modHold.handleFlagsChanged(modifierDown: true)
        XCTAssertEqual(modHold.phase, .pending)

        modHold.advanceTime(by: 0.24)
        XCTAssertEqual(modHold.phase, .pending)

        modHold.advanceTime(by: 0.02)
        XCTAssertEqual(modHold.phase, .hintsVisible)

        let consumed = modHold.handleKeyDown(
            KeyEvent(character: "3", modifiers: .command))
        XCTAssertTrue(consumed)
        XCTAssertEqual(digits, ["3"])
        XCTAssertEqual(modHold.phase, .idle)

        modHold.handleFlagsChanged(modifierDown: true)
        modHold.advanceTime(by: 0.3)
        modHold.handleFlagsChanged(modifierDown: false)
        XCTAssertEqual(modHold.phase, .idle)
    }

    func testEventJumpHoldReusesHoldEngine() {
        let timer = DispatchTimer()
        var digits: [Character] = []
        let holdF = HoldModifierDetectorFactory.eventJumpHold(timer: timer) { digit in
            digits.append(digit)
        }

        _ = holdF.handleKeyDown(KeyEvent(character: "f"))
        holdF.advanceTime(by: 0.25)
        XCTAssertEqual(holdF.phase, .hintsVisible)

        _ = holdF.handleKeyDown(KeyEvent(character: "2"))
        XCTAssertEqual(digits, ["2"])
    }

    func testShiftSlashMatchesQuestionMarkShortcutBinding() throws {
        let entry = try XCTUnwrap(registry.entries.first { $0.id == .otherShortcuts })
        let chord = try XCTUnwrap(entry.bindingChords.first)
        let shiftSlash = KeyEvent(key: .punctuation("/"), modifiers: [.shift])
        XCTAssertTrue(shiftSlash.matches(chord))
    }

    func testPointerHintResolver() {
        XCTAssertEqual(PointerHintResolver.primaryShortcut(for: .eventCard), .editOpen)
        XCTAssertEqual(PointerHintResolver.primaryShortcut(for: .timedSlot), .createTypedTime)
        XCTAssertEqual(PointerHintResolver.primaryShortcut(for: .hoverHunt), .focusPageJump)
        XCTAssertTrue(PointerHintResolver.teachingShortcutIds(for: .eventCard).contains(.focusShiftHold))
    }
}
