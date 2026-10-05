import AppKit
import CompassKit

@MainActor
enum CompassFeedbackPanel {
    static func present(appView: String = "help_menu") {
        let alert = NSAlert()
        alert.messageText = "Share feedback"
        alert.informativeText = "Send feedback without leaving Compass."
        alert.alertStyle = .informational

        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 88))
        field.placeholderString = DesktopFeedbackSurvey.questionText
        field.maximumNumberOfLines = 6
        field.cell?.wraps = true
        field.cell?.isScrollable = true
        alert.accessoryView = field
        alert.addButton(withTitle: "Send feedback")
        alert.addButton(withTitle: "Cancel")

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let details = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !details.isEmpty else { return }

        Task {
            do {
                try await PostHogCapture.shared.submitFeedback(details: details, appView: appView)
            } catch {
                let failure = NSAlert()
                failure.messageText = "Couldn't send your feedback"
                failure.informativeText = "Please try again later."
                failure.runModal()
            }
        }
    }
}
