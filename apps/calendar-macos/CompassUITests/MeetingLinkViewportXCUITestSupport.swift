import XCTest

struct MainWindowGeometryProbeReading: Equatable {
    let targetWidth: Int
    let targetHeight: Int
    let achievedWidth: Int
    let achievedHeight: Int
    let screenWidth: Int
    let screenHeight: Int
    let fitsScreen: Bool
    let achievedTarget: Bool
    let onScreen: Bool
}

enum MeetingLinkViewportXCUITestSupport {
    /// Resolves the main window by accessibility identifier. Avoids title-based `windows["Compass"]`
    /// while the AX tree is still growing on wide viewport launches.
    @MainActor
    static func waitForMainWindow(app: XCUIApplication, timeout: TimeInterval) -> XCUIElement {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: timeout))
        let window = app.windows.matching(NSPredicate(format: "identifier == %@", "Compass")).firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: timeout))
        return window
    }

    /// Reads the window-value geometry mirror only. Avoids `descendants` while the SwiftUI tree is still mounting.
    @MainActor
    static func waitForGeometryPayload(on window: XCUIElement, timeout: TimeInterval) -> String {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let raw = window.value as? String, parseGeometryProbe(raw) != nil {
                return raw
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        let windowValue = String(describing: window.value)
        XCTFail("Geometry mirror not readable within \(timeout)s; window value=\(windowValue)")
        return ""
    }

    static func parseGeometryProbe(_ raw: String) -> MainWindowGeometryProbeReading? {
        var fields: [String: String] = [:]
        for part in raw.split(separator: ";") {
            let pieces = part.split(separator: "=", maxSplits: 1).map(String.init)
            guard pieces.count == 2 else { continue }
            fields[pieces[0]] = pieces[1]
        }
        guard let target = fields["target"]?.split(separator: "x").map({ Int($0) ?? -1 }),
            target.count == 2,
            let achieved = fields["achieved"]?.split(separator: "x").map({ Int($0) ?? -1 }),
            achieved.count == 2,
            let screen = fields["screen"]?.split(separator: "x").map({ Int($0) ?? -1 }),
            screen.count == 2,
            let fitsScreen = Int(fields["fitsScreen"] ?? ""),
            let achievedTarget = Int(fields["achievedTarget"] ?? ""),
            let onScreen = Int(fields["onScreen"] ?? "")
        else { return nil }
        return MainWindowGeometryProbeReading(
            targetWidth: target[0],
            targetHeight: target[1],
            achievedWidth: achieved[0],
            achievedHeight: achieved[1],
            screenWidth: screen[0],
            screenHeight: screen[1],
            fitsScreen: fitsScreen != 0,
            achievedTarget: achievedTarget != 0,
            onScreen: onScreen != 0)
    }

    static func attachGeometryEvidence(
        _ testcase: XCTestCase,
        reading: MainWindowGeometryProbeReading,
        window: XCUIElement,
        elements: [(String, XCUIElement)]
    ) {
        let log = """
        target=\(reading.targetWidth)x\(reading.targetHeight) \
        achieved=\(reading.achievedWidth)x\(reading.achievedHeight) \
        screen=\(reading.screenWidth)x\(reading.screenHeight) \
        fitsScreen=\(reading.fitsScreen) achievedTarget=\(reading.achievedTarget) onScreen=\(reading.onScreen)
        windowFrame=\(window.frame)
        \(elements.map { "\($0.0)=\($0.1.frame) hittable=\($0.1.isHittable)" }.joined(separator: "\n"))
        """
        let text = XCTAttachment(string: log)
        text.name = "Meeting link viewport measurements"
        text.lifetime = .keepAlways
        testcase.add(text)
    }

    static func assertFullyVisibleInWindow(
        _ element: XCUIElement,
        window: XCUIElement,
        label: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertGreaterThan(element.frame.width, 0, "\(label) needs positive width", file: file, line: line)
        XCTAssertGreaterThan(element.frame.height, 0, "\(label) needs positive height", file: file, line: line)
        XCTAssertTrue(element.isHittable, "\(label) must be on-screen and unobscured", file: file, line: line)
        let windowFrame = window.frame
        XCTAssertTrue(
            windowFrame.contains(element.frame),
            "\(label) full bounds must lie inside the window frame; window=\(windowFrame) element=\(element.frame)",
            file: file,
            line: line)
    }

    static func assertFullyVisibleInScrollViewport(
        _ element: XCUIElement,
        viewport: CGRect,
        label: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertGreaterThan(element.frame.width, 0, file: file, line: line)
        XCTAssertGreaterThan(element.frame.height, 0, file: file, line: line)
        XCTAssertTrue(
            viewport.contains(element.frame),
            "\(label) full bounds must lie inside the form scroll viewport; viewport=\(viewport) element=\(element.frame)",
            file: file,
            line: line)
    }
}
