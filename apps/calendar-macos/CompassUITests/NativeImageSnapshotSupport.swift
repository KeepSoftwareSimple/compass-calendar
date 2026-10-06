import XCTest

enum NativeImageSnapshotSupport {
    static let recordSnapshots = ProcessInfo.processInfo.environment["RECORD_SNAPSHOTS"] == "1"

    @MainActor
    static func captureWindow(_ window: XCUIElement, named name: String, file: StaticString = #filePath, line: UInt = #line) {
        guard window.waitForExistence(timeout: 15) else {
            XCTFail("Window missing for snapshot \(name)", file: file, line: line)
            return
        }
        let screenshot = window.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        XCTContext.runActivity(named: "Snapshot \(name)") { activity in
            activity.add(attachment)
        }

        guard let referenceURL = referenceImageURL(named: name) else {
            XCTFail("Could not resolve ReferenceImages bundle path for \(name)", file: file, line: line)
            return
        }

        if recordSnapshots {
            do {
                try FileManager.default.createDirectory(
                    at: referenceURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true)
                try screenshot.pngRepresentation.write(to: referenceURL)
            } catch {
                XCTFail("Failed to record snapshot \(name): \(error)", file: file, line: line)
            }
            return
        }

        guard FileManager.default.fileExists(atPath: referenceURL.path) else {
            return
        }
        do {
            let reference = try Data(contentsOf: referenceURL)
            XCTAssertEqual(
                screenshot.pngRepresentation,
                reference,
                "Snapshot \(name) differs from ReferenceImages/\(name).png. Re-record with the record-macos-snapshots workflow.",
                file: file,
                line: line)
        } catch {
            XCTFail("Failed to load reference snapshot \(name): \(error)", file: file, line: line)
        }
    }

    private static func referenceImageURL(named name: String) -> URL? {
        let testBundle = Bundle(for: BundleLocator.self)
        guard let resourceURL = testBundle.resourceURL else { return nil }
        return resourceURL.appendingPathComponent("ReferenceImages/\(name).png")
    }

    private final class BundleLocator {}
}
