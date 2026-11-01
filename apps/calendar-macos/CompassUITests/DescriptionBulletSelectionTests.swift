import AppKit
import XCTest

final class DescriptionBulletSelectionTests: XCTestCase {
    @MainActor
    func testSelectedPlaceLinesBecomeBulletsWithoutChangingPrecedingTextAfterReopen() throws {
        let pasteboard = NSPasteboard.general
        let original = (pasteboard.pasteboardItems ?? []).map { item in
            Dictionary(uniqueKeysWithValues: item.types.compactMap { type in
                item.data(forType: type).map { (type.rawValue, $0) }
            })
        }
        addTeardownBlock {
            await MainActor.run {
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                let items = original.map { values in
                    let item = NSPasteboardItem()
                    for (type, data) in values { item.setData(data, forType: .init(type)) }
                    return item
                }
                if !items.isEmpty { pasteboard.writeObjects(items) }
            }
        }
        let app = XCUIApplication.compassUITest()
        app.launchArguments += [
            "-COMPASS_FIXTURE", "demo",
            "-COMPASS_UI_TEST_INITIAL_GRID_FOCUS_EVENT", "demo-morning-standup",
            "-COMPASS_UI_TEST_PIN_WEEK_GRID_TRACK", "-COMPASS_UI_TEST_OPEN_FOCUSED_EVENT_FORM",
        ]
        app.launch()
        let window = app.windows["Compass"]
        let editor = window.textViews["compass-event-form-description"]
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        window.typeKey("9", modifierFlags: [.command])
        editor.click()
        let places = ["Magpie Art Supply, LLC", "Paper and Grace", "Sacks Thrift Store", "Salvation Army", "UFS BZN"]
        let prefix = "LIST\n- Frames\n- Art supplies\nPLACES\n"
        let richText = "LIST\u{2028}- Frames\u{2028}- Art supplies\nPLACES\u{2028}"
            + places.joined(separator: "\u{2028}")
        let attributed = NSAttributedString(string: richText)
        let rtf = try attributed.data(from: NSRange(location: 0, length: attributed.length),
            documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf])
        pasteboard.clearContents()
        pasteboard.setData(rtf, forType: .rtf)
        pasteboard.setString(richText, forType: .string)
        editor.typeKey("a", modifierFlags: [.command])
        editor.typeKey("v", modifierFlags: [.command])
        XCTAssertEqual((editor.value as? String)?.replacingOccurrences(of: "\u{2028}", with: "\n"),
            prefix + places.joined(separator: "\n"))
        editor.typeKey(.upArrow, modifierFlags: [.command])
        for _ in 0 ..< 4 { editor.typeKey(.downArrow, modifierFlags: []) }
        editor.typeKey(.downArrow, modifierFlags: [.command, .shift])
        let bullets = window.checkBoxes["Bullet list"]
        XCTAssertTrue(bullets.waitForExistence(timeout: 8))
        bullets.click()
        let expected = prefix + places.map { "• \($0)" }.joined(separator: "\n")
        XCTAssertEqual((editor.value as? String)?.replacingOccurrences(of: "\u{2028}", with: "\n"), expected)
        window.typeKey(.enter, modifierFlags: [.command])
        XCTAssertTrue(editor.waitForNonExistence(timeout: 8))
        window.typeKey(.return, modifierFlags: [])
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        window.typeKey("9", modifierFlags: [.command])
        XCTAssertEqual((editor.value as? String)?.replacingOccurrences(of: "\u{2028}", with: "\n"), expected)
        editor.typeKey(.upArrow, modifierFlags: [.command])
        for _ in 0 ..< 4 {
            XCTAssertEqual(String(describing: bullets.value ?? ""), "0",
                "Preceding literal list text and headings must stay outside the bullet list")
            editor.typeKey(.downArrow, modifierFlags: [])
        }
        for index in places.indices {
            XCTAssertEqual(String(describing: bullets.value ?? ""), "1",
                "Selected place \(places[index]) must retain bullet formatting after reopening")
            if index < places.count - 1 { editor.typeKey(.downArrow, modifierFlags: []) }
        }
        let evidence = XCTAttachment(screenshot: window.screenshot())
        evidence.name = "Selected place bullets and preserved preceding text after reopening"
        evidence.lifetime = .keepAlways
        add(evidence)
    }
}
