import AppKit
import Network

@MainActor
final class NativeDesktopResumeMonitor {
    var onResume: (() -> Void)?

    private var pathMonitor: NWPathMonitor?
    private var networkSatisfied = true

    func start() {
        let monitor = NWPathMonitor()
        pathMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let satisfied = path.status == .satisfied
                defer { self.networkSatisfied = satisfied }
                guard satisfied, !self.networkSatisfied else { return }
                self.onResume?()
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.compasscalendar.desktop.native-network"))

        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(handleWake),
            name: NSWorkspace.didWakeNotification,
            object: nil)
    }

    @objc private func handleWake() {
        onResume?()
    }
}
