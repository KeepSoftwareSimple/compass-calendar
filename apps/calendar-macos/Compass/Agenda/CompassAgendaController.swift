import AppKit
import CompassKit

@MainActor
protocol CompassAgendaDeepLinkDelivering: AnyObject {
    func deliverDeepLink(_ url: String)
}

@MainActor
final class CompassAgendaController: NSObject {
    static let shared = CompassAgendaController()

    private weak var deepLinkDeliverer: CompassAgendaDeepLinkDelivering?
    private var statusItem: NSStatusItem?
    private var items: [DesktopAgendaItem] = []
    private var refreshTimer: Timer?

    private override init() {
        super.init()
    }

    func configure(deepLinkDeliverer: CompassAgendaDeepLinkDelivering) {
        self.deepLinkDeliverer = deepLinkDeliverer
        ensureStatusItem()
        startRefreshTimer()
        refreshPresentation()
    }

    func updateAgenda(_ items: [DesktopAgendaItem]) {
        self.items = items
        refreshPresentation()
    }

    private func ensureStatusItem() {
        guard statusItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "Compass"
        statusItem = item
    }

    private func startRefreshTimer() {
        refreshTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshPresentation()
            }
        }
        refreshTimer = timer
    }

    private func refreshPresentation() {
        let presentation = DesktopAgendaFormatter.presentation(items: items, now: Date())
        statusItem?.button?.title = presentation.statusBarTitle
        NSApp.dockTile.badgeLabel = presentation.dockBadgeLabel

        let menu = NSMenu()
        for entry in presentation.menuEntries {
            switch entry.kind {
            case .emptyState:
                let item = NSMenuItem(title: "Nothing else today", action: nil, keyEquivalent: "")
                item.isEnabled = false
                menu.addItem(item)
            case let .event(eventId, label):
                let item = NSMenuItem(title: label, action: #selector(openEvent(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = eventId
                menu.addItem(item)
            }
        }
        statusItem?.menu = menu
    }

    @objc private func openEvent(_ sender: NSMenuItem) {
        guard let eventId = sender.representedObject as? String else { return }
        NSApp.activate(ignoringOtherApps: true)
        deepLinkDeliverer?.deliverDeepLink("compass://event/\(eventId)")
    }
}
