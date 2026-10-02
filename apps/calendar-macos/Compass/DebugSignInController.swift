import AppKit

@MainActor
enum DebugSignInController {
    static func prompt(parentWindow: NSWindow?) async -> (email: String, password: String)? {
        await withCheckedContinuation { continuation in
            let alert = NSAlert()
            alert.messageText = "Debug sign in"
            alert.informativeText = "Email and password for production dogfood. Removed when the auth modal ships."
            alert.addButton(withTitle: "Sign in")
            alert.addButton(withTitle: "Cancel")

            let stack = NSStackView()
            stack.orientation = .vertical
            stack.spacing = 8
            let emailField = NSTextField(string: "")
            emailField.placeholderString = "Email"
            let passwordField = NSSecureTextField(string: "")
            passwordField.placeholderString = "Password"
            stack.addArrangedSubview(emailField)
            stack.addArrangedSubview(passwordField)
            alert.accessoryView = stack

            func finish(response: NSApplication.ModalResponse) {
                guard response == .alertFirstButtonReturn else {
                    continuation.resume(returning: nil)
                    return
                }
                let email = emailField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                let password = passwordField.stringValue
                guard !email.isEmpty, !password.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: (email, password))
            }

            if let window = parentWindow ?? NSApp.keyWindow ?? NSApp.mainWindow {
                alert.beginSheetModal(for: window) { finish(response: $0) }
            } else {
                finish(response: alert.runModal())
            }
        }
    }
}
