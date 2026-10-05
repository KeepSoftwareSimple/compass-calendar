import CompassKit
import XCTest

final class SettingsSectionSnapshotTests: XCTestCase {
    func testAccountsSliceSnapshotsAreStable() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        for snapshot in SettingsSectionSnapshots.accountsSlice {
            let data = try encoder.encode(snapshot)
            let json = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(json.contains(snapshot.sectionId))
            for identifier in snapshot.accessibilityIdentifiers {
                XCTAssertTrue(json.contains(identifier))
            }
        }
        XCTAssertEqual(SettingsSectionSnapshots.accountsSlice.count, 2)
    }
}
