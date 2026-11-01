// Mirrors web welcome, first-event, and connect-calendar onboarding stores.

import CompassKit
import Foundation

public enum FirstEventDoneReason: String, Sendable {
    case completed
    case dismissed
}

@MainActor
@Observable
public final class OnboardingStore {
    public private(set) var welcomeStep = 1
    /// Open welcome FAQ rows, by index into `WelcomeFaq.items`.
    public private(set) var welcomeFaqExpanded: Set<Int> = []
    public var isWelcomeFirstVisitOpen = false
    public var isWelcomeGuideOpen = false
    public private(set) var isFirstEventDone = false
    public private(set) var isFirstEventCelebrating = false
    public private(set) var isConnectCalendarSnoozed: Bool
    public private(set) var userMetadataLoaded = false
    public private(set) var anonymousWriteCount: Int
    public private(set) var anonymousShortcutCount: Int
    public private(set) var isLocalModeConnectPromptDismissed: Bool
    public private(set) var isMeetingPageNudgeDismissed: Bool

    private let defaults: UserDefaults
    private let analytics: ProductAnalyticsClient
    private var hasTrackedFirstEventShown = false
    private var hasTrackedLocalModeConnectPromptShown = false

    public init(
        defaults: UserDefaults = .standard,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient()
    ) {
        self.defaults = defaults
        self.analytics = analytics
        isConnectCalendarSnoozed = OnboardingGating.isConnectCalendarPromptSnoozed(defaults: defaults)
        isFirstEventDone = OnboardingGating.firstEventDoneReason(defaults: defaults) != nil
        anonymousWriteCount = defaults.integer(forKey: OnboardingStorageKeys.anonymousCalendarWriteCount)
        anonymousShortcutCount = defaults.integer(forKey: OnboardingStorageKeys.anonymousShortcutEngagementCount)
        isLocalModeConnectPromptDismissed = defaults.bool(forKey: OnboardingStorageKeys.hasDismissedLocalModeConnectPrompt)
        isMeetingPageNudgeDismissed = defaults.bool(forKey: OnboardingStorageKeys.hasDismissedMeetingPageNudge)
    }

    public var hasSeenWelcome: Bool {
        OnboardingGating.hasSeenWelcome(defaults: defaults)
    }

    public func markUserMetadataLoaded() {
        userMetadataLoaded = true
    }

    public func resetUserMetadataLoaded() {
        userMetadataLoaded = false
    }

    public func openWelcomeGuide() {
        isWelcomeGuideOpen = true
    }

    public func closeWelcomeGuide() {
        isWelcomeGuideOpen = false
    }

    public func setWelcomeFirstVisitOpen(_ open: Bool) {
        isWelcomeFirstVisitOpen = open
    }

    public func advanceWelcomeStep() {
        welcomeStep = min(welcomeStep + 1, 4)
    }

    public func retreatWelcomeStep() {
        welcomeStep = max(welcomeStep - 1, 1)
    }

    public func toggleWelcomeFaq(_ index: Int) {
        guard WelcomeFaq.items.indices.contains(index) else { return }
        if welcomeFaqExpanded.contains(index) {
            welcomeFaqExpanded.remove(index)
        } else {
            welcomeFaqExpanded.insert(index)
        }
    }

    public func markWelcomeSeen(exit: String?) {
        defaults.set("true", forKey: OnboardingStorageKeys.hasSeenWelcome)
        if let exit {
            defaults.set(exit, forKey: OnboardingStorageKeys.welcomeExit)
        }
    }

    public func trackWelcomeShownIfNeeded() {
        analytics.track(ProductEvent.welcomeModalShown, properties: [:])
    }

    public func dismissFirstEventPrompt() {
        guard !isFirstEventCelebrating else { return }
        markFirstEventDone(.dismissed)
        analytics.track(ProductEvent.firstEventPromptDismissed, properties: [:])
        isFirstEventDone = true
        isFirstEventCelebrating = false
    }

    public func noteRealEventCreated(showcaseActive: Bool) {
        guard !isFirstEventDone, !isFirstEventCelebrating else { return }
        guard !showcaseActive else { return }
        markFirstEventDone(.completed)
        analytics.track(ProductEvent.firstEventPromptCompleted, properties: [:])
        isFirstEventCelebrating = true
    }

    /// Web `noteAnonymousCalendarWriteEngagement`.
    public func noteAnonymousCalendarWrite() {
        anonymousWriteCount += 1
        defaults.set(anonymousWriteCount, forKey: OnboardingStorageKeys.anonymousCalendarWriteCount)
    }

    /// Web `noteAnonymousShortcutEngagementIfEligible`; the caller checks auth history.
    public func noteAnonymousShortcut() {
        anonymousShortcutCount += 1
        defaults.set(anonymousShortcutCount, forKey: OnboardingStorageKeys.anonymousShortcutEngagementCount)
    }

    public var defersFirstEventPromptForSignUpNudge: Bool {
        AnonymousExplorerEngagement.shouldDeferFirstEventPrompt(
            writeCount: anonymousWriteCount, shortcutCount: anonymousShortcutCount)
    }

    public func dismissLocalModeConnectPrompt() {
        analytics.track(
            ProductEvent.connectPromptDismissed,
            properties: ["events_created_count": .int(anonymousWriteCount), "provider": .string("google")])
        defaults.set(true, forKey: OnboardingStorageKeys.hasDismissedLocalModeConnectPrompt)
        isLocalModeConnectPromptDismissed = true
    }

    public func trackLocalModeConnectPromptShownOnce() {
        guard !hasTrackedLocalModeConnectPromptShown else { return }
        hasTrackedLocalModeConnectPromptShown = true
        analytics.track(
            ProductEvent.connectPromptShown,
            properties: ["events_created_count": .int(anonymousWriteCount), "provider": .string("google")])
    }

    public func trackLocalModeConnectPromptClicked() {
        analytics.track(
            ProductEvent.connectPromptClicked,
            properties: ["events_created_count": .int(anonymousWriteCount), "provider": .string("google")])
    }

    public func dismissMeetingPageNudge() {
        defaults.set(true, forKey: OnboardingStorageKeys.hasDismissedMeetingPageNudge)
        isMeetingPageNudgeDismissed = true
    }

    public func finalizeFirstEventCelebration() {
        isFirstEventDone = true
        isFirstEventCelebrating = false
    }

    public func trackFirstEventShownOnce() {
        guard !hasTrackedFirstEventShown else { return }
        hasTrackedFirstEventShown = true
        analytics.track(ProductEvent.firstEventPromptShown, properties: [:])
    }

    public func snoozeConnectCalendarPrompt(nowMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        defaults.set(String(nowMs), forKey: OnboardingStorageKeys.connectCalendarPromptSnoozedAt)
        isConnectCalendarSnoozed = true
        analytics.track(
            ProductEvent.connectCalendarPromptDismissed,
            properties: ["snooze_days": .int(7)])
    }

    public func refreshConnectCalendarSnooze() {
        isConnectCalendarSnoozed = OnboardingGating.isConnectCalendarPromptSnoozed(defaults: defaults)
    }

    private func markFirstEventDone(_ reason: FirstEventDoneReason) {
        defaults.set(reason.rawValue, forKey: OnboardingStorageKeys.firstEventDone)
    }
}
