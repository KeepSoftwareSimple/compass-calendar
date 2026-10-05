import AppKit
import CompassKit

@MainActor
enum CompassAboutPanel {
    static func present(from _: Any?) {
        let alert = NSAlert()
        alert.messageText = "Compass"
        alert.informativeText =
            "Version \(AppBuildInfo.marketingVersion)\nBuild \(AppBuildInfo.buildNumber)"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        if let window = NSApp.keyWindow ?? NSApp.mainWindow {
            alert.beginSheetModal(for: window) { _ in }
        } else {
            alert.runModal()
        }
    }
}
