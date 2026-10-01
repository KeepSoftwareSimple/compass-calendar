import AppKit

@MainActor
enum MainMenu {
    static func make(controller: MainMenuController) -> NSMenu {
        controller.makeMenu()
    }
}
