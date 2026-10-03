import CompassKit
import XCTest

final class SettingsSectionSnapshotTests: XCTestCase {
    func testSectionSnapshotsAreStable() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        for snapshot in SettingsSectionSnapshots.all {
            let data = try encoder.encode(snapshot)
            let json = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(json.contains(snapshot.sectionId))
        }
        XCTAssertEqual(SettingsSectionSnapshots.all.count, 7)
    }
}
