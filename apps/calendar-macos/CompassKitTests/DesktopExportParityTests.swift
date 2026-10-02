import Foundation
import XCTest
@testable import CompassKit

final class DesktopExportParityTests: XCTestCase {
    private struct ShortcutsDocument: Decodable {
        struct RegistryRow: Decodable {
            let id: String
            let section: String
        }

        let registry: [RegistryRow]
    }

    func testShortcutsRegistryShape() throws {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: "shortcuts"))
        let document = try JSONDecoder().decode(
            ShortcutsDocument.self,
            from: Data(contentsOf: url)
        )
        XCTAssertEqual(document.registry.count, 81)
        XCTAssertEqual(Set(document.registry.map(\.section)).count, 5)
        XCTAssertEqual(ShortcutId.allCases.count, document.registry.count)
        for row in document.registry {
            XCTAssertFalse(row.id.isEmpty)
            XCTAssertFalse(row.section.isEmpty)
        }
    }

    func testFixtureFilesLoad() throws {
        for name in [
            "timed-deck.vectors",
            "rrule.vectors",
            "nudge.vectors",
            "go-to-date.vectors",
            "demo-seed",
        ] {
            let url = try XCTUnwrap(
                DesktopExportFixtures.url(named: name),
                "missing fixture \(name)"
            )
            let data = try Data(contentsOf: url)
            XCTAssertGreaterThan(data.count, 10)
        }
    }
}

enum DesktopExportFixtures {
    private static let resourceBundle = CompassKitResourceBundle.resources

    static func url(named name: String) -> URL? {
        for subdirectory in ["Fixtures", "Resources/Fixtures", "Resources", ""] {
            if let url = resourceBundle.url(
                forResource: name,
                withExtension: "json",
                subdirectory: subdirectory.isEmpty ? nil : subdirectory
            ) {
                return url
            }
        }
        return nil
    }
}
