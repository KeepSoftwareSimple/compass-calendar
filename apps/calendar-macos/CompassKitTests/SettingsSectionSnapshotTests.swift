import CompassKit
import XCTest

final class SettingsSectionSnapshotTests: XCTestCase {
    func testLaunchHotkeySliceSnapshotsAreStable() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        for snapshot in SettingsSectionSnapshots.launchHotkeySlice {
            let data = try encoder.encode(snapshot)
            let json = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(json.contains(snapshot.sectionId))
            for identifier in snapshot.accessibilityIdentifiers {
                XCTAssertTrue(json.contains(identifier))
            }
        }
        XCTAssertEqual(SettingsSectionSnapshots.launchHotkeySlice.count, 2)
    }

    func testTimezoneThemeSliceSnapshotsAreStable() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        for snapshot in SettingsSectionSnapshots.timezoneThemeSlice {
            let data = try encoder.encode(snapshot)
            let json = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(json.contains(snapshot.sectionId))
            for identifier in snapshot.accessibilityIdentifiers {
                XCTAssertTrue(json.contains(identifier))
            }
        }
        XCTAssertEqual(SettingsSectionSnapshots.timezoneThemeSlice.count, 2)
    }

    func testAllSectionSnapshotsAreStable() throws {
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
