import AppKit
import CompassKit
import Network

/// Observes sleep wake and network path changes for the hosted web app.
@MainActor
final class WebViewResilience {
    private let onNetworkReachable: () -> Void
    private let onSystemResume: () -> Void
    private var pathMonitor: NWPathMonitor?
    private var wasOffline = false
    private var wakeObserver: NSObjectProtocol?

    init(onNetworkReachable: @escaping () -> Void, onSystemResume: @escaping () -> Void) {
        self.onNetworkReachable = onNetworkReachable
        self.onSystemResume = onSystemResume
    }

    func start() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let reachable = path.status == .satisfied
                if reachable, self.wasOffline {
                    self.onNetworkReachable()
                }
                self.wasOffline = !reachable
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.compasscalendar.desktop.network"))
        pathMonitor = monitor

        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.onSystemResume()
            }
        }
    }

    func stop() {
        pathMonitor?.cancel()
        pathMonitor = nil
        if let wakeObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(wakeObserver)
            self.wakeObserver = nil
        }
    }
}
