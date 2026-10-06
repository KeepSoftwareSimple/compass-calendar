import Foundation
import XCTest
@testable import CompassKit

final class BlockPartyParityTests: XCTestCase {
    func testReplayEveryExportedCase() throws {
        let document = try BlockPartyTasksCatalog.load()
        XCTAssertEqual(document.runTasks.count, 11)
        XCTAssertFalse(document.cases.isEmpty)

        for replayCase in document.cases {
            var state = BlockPartyEngine.createInitialState(
                seedEvents: document.seedEvents,
                runTasks: document.runTasks
            )
            state = BlockPartyEngine.startRun(state, nowMs: replayCase.nowMs)

            if replayCase.id == "skip-first-task" {
                state = BlockPartyEngine.skipCurrentTask(state, nowMs: replayCase.nowMs)
            } else {
                for token in replayCase.keys {
                    let key = try XCTUnwrap(
                        BlockPartyEngine.parseKey(token),
                        "unknown key token \(token) in \(replayCase.id)"
                    )
                    state = BlockPartyEngine.handleKey(state, key: key, nowMs: replayCase.nowMs)
                }
            }

            XCTAssertEqual(
                state.snapshot(),
                replayCase.output,
                "block party case \(replayCase.id)"
            )
        }
    }
}
