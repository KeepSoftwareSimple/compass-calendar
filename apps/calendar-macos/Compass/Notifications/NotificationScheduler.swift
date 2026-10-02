import CompassData
import CompassKit
import Foundation

@MainActor
final class NotificationScheduler {
    private weak var model: NativeCalendarRootModel?
    private var firedKeys: Set<String> = []
    private var timer: Timer?
    private var bannerRetryKeys: Set<String> = []

    func start(model: NativeCalendarRootModel) {
        self.model = model
        timer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.tick()
            }
        }
        self.timer = timer
        Task { await tick() }
        Task {
            await CompassNotificationCenter.shared.requestAuthorizationIfNeeded()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        model = nil
    }

    func notifySidebandDidRefresh() async {
        await tick()
    }

    func retryBannerNotification(for event: NotifiableEvent) async {
        let key = UpcomingNotifierLogic.notificationKey(for: event)
        guard !bannerRetryKeys.contains(key) else { return }
        bannerRetryKeys.insert(key)
        let payload = UpcomingNotifierLogic.notificationPayload(for: event)
        _ = await CompassNotificationCenter.shared.showNative(payload)
    }

    private func tick() async {
        guard let model else { return }
        let now = model.referenceNow
        let notifiable = UpcomingNotifierLogic.toNotifiableEvents(model.sidebandTimedCandidates())
        firedKeys = await UpcomingNotifierLogic.announceUpcomingEvents(
            now: now,
            events: notifiable,
            firedKeys: firedKeys,
            show: { payload in
                await CompassNotificationCenter.shared.showNative(payload)
            })
    }
}
