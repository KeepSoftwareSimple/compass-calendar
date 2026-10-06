import AppKit
import CompassKit
import Sparkle

/// Sparkle wrapper. Checks on launch and every six hours, downloads in the
/// background, and installs on quit. When an update is staged the native banner
/// or Compass menu offers restart via Sparkle; failures are logged and never block the app.
@MainActor
final class DesktopUpdater: NSObject, SPUUpdaterDelegate {
    var onUpdateReady: ((String) -> Void)?

    private var controller: SPUStandardUpdaterController?
    private var installNow: (() -> Void)?

    var canCheckForUpdates: Bool { controller?.updater.canCheckForUpdates ?? false }
    var isUpdateStaged: Bool { installNow != nil }

    func start() {
        let publicKey = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String
        guard UpdatePolicy.isEnabled(publicKey: publicKey) else {
            NSLog("Compass updates are off: no SUPublicEDKey in Info.plist")
            return
        }
        let controller = SPUStandardUpdaterController(
            startingUpdater: false,
            updaterDelegate: self,
            userDriverDelegate: nil)
        controller.updater.updateCheckInterval = UpdatePolicy.checkInterval
        controller.updater.automaticallyChecksForUpdates = true
        controller.updater.automaticallyDownloadsUpdates = true
        self.controller = controller
        controller.startUpdater()
    }

    func checkForUpdates() {
        controller?.checkForUpdates(nil)
    }

    func restartToUpdate() {
        installNow?()
    }

    /// `COMPASS_UPDATE_CHANNEL`, stamped into Info.plist by the dev workflow.
    nonisolated static var channel: String? {
        Bundle.main.object(forInfoDictionaryKey: "COMPASS_UPDATE_CHANNEL") as? String
    }

    // MARK: SPUUpdaterDelegate

    func feedURLString(for updater: SPUUpdater) -> String? {
        UpdatePolicy.feedURLOverride(channel: Self.channel)
    }

    /// Returning true takes over the restart prompt: Sparkle stays quiet and
    /// the native banner (or the menu item) calls the stored block.
    func updater(
        _ updater: SPUUpdater,
        willInstallUpdateOnQuit item: SUAppcastItem,
        immediateInstallationBlock immediateInstallHandler: @escaping () -> Void
    ) -> Bool {
        installNow = immediateInstallHandler
        onUpdateReady?(item.displayVersionString)
        return true
    }

    func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
        NSLog("Compass update check failed: \(error.localizedDescription)")
    }
}
