import Foundation
import XCTest
@testable import CompassKit

final class HtmlFragmentParityTests: XCTestCase {
    func testHtmlFragmentVectors() throws {
        let cases = try loadVectorCases(named: "html-fragment.vectors")
        for vectorCase in cases {
            let id = vectorCase["id"] as? String ?? "unknown"
            let input = try XCTUnwrap(vectorCase["input"] as? [String: Any])
            let output = try XCTUnwrap(vectorCase["output"] as? [String: Any])
            let html = input["html"] as? String ?? ""

            let expectedNormalized = output["normalized"] as? String ?? ""
            let expectedRoundTrip = output["roundTrip"] as? String ?? ""
            let expectedPlainText = output["plainText"] as? String ?? ""

            XCTAssertEqual(
                HTMLFragmentDocument.normalizeStoredDescription(html),
                expectedNormalized,
                "normalized mismatch for \(id)"
            )
            XCTAssertEqual(
                HTMLFragmentDocument.roundTrip(html),
                expectedRoundTrip,
                "roundTrip mismatch for \(id)"
            )
            XCTAssertEqual(
                HTMLFragmentDocument.parse(html).plainText,
                expectedPlainText,
                "plainText mismatch for \(id)"
            )
        }
    }

    private func loadVectorCases(named name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(DesktopExportFixtures.url(named: name))
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(json?["cases"] as? [[String: Any]])
    }
}
