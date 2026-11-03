import CompassKit
import Foundation

/// Web anonymous-explorer engagement, the local-mode sign-up card, the sidebar
/// meeting-page nudge, and notice CTA letters (`useNoticeActionShortcut`).
extension NativeCalendarRootModel {
    /// Never signed in on this Mac: events live in the local store.
    var isAnonymousExplorer: Bool {
        !isSignedIn && eventsStore.source == .local
    }

    /// Web `noteFirstRealEventCreated` plus `noteAnonymousWriteEngagementIfEligible`.
    func noteEventWriteLanded(isNewCreate: Bool) {
        if isNewCreate, !undoStore.isRestoringHistory() {
            onboardingStore.noteRealEventCreated(showcaseActive: blockPartyStore.isActive)
        }
        if isAnonymousExplorer {
            onboardingStore.noteAnonymousCalendarWrite()
        }
    }

    func noteShortcutEngagementIfAnonymous() {
        guard isAnonymousExplorer else { return }
        onboardingStore.noteAnonymousShortcut()
    }

    /// Web `LocalModeConnectPrompt` eligibility.
    public var showsLocalModeConnectPrompt: Bool {
        guard !isDemoFixture, billingStore.gateStatus == nil else { return false }
        return AnonymousExplorerEngagement.localModePromptEligible(.init(
            authenticated: isSignedIn,
            hasUserEverAuthenticated: eventsStore.source != .local,
            writeCount: onboardingStore.anonymousWriteCount,
            shortcutCount: onboardingStore.anonymousShortcutCount,
            isDismissed: onboardingStore.isLocalModeConnectPromptDismissed,
            isAuthModalOpen: authStore.isModalPresented,
            isShowcaseActive: blockPartyStore.isActive,
            isWelcomeBlocking: !onboardingStore.hasSeenWelcome || onboardingStore.isWelcomeFirstVisitOpen,
            signInAvailable: configStore.config?.providers.google.signIn ?? false,
            firstEventPromptVisible: activeOnboardingSurface == .firstEventPrompt,
            firstEventCelebrating: onboardingStore.isFirstEventCelebrating))
    }

    public func startTrialFromLocalModePrompt() {
        onboardingStore.trackLocalModeConnectPromptClicked()
        authStore.openModal(.signUp)
    }

    /// Web `useMeetingPageNudge`: after the first event, until a page is live or dismissed.
    public var showsMeetingPageNudge: Bool {
        isSignedIn && onboardingStore.isFirstEventDone && !onboardingStore.isMeetingPageNudgeDismissed
            && bookingStore.serverPage != nil && !bookingStore.isLive
    }

    /// Web `CalendarConnectionBannerGate`: the account that most needs help.
    public var connectionBanner: CalendarConnectionBanner? {
        guard isSignedIn, viewStore.view != .life else { return nil }
        return CalendarConnectionBanner.pick(syncConnectionsStore.connections)
    }

    public func runConnectionBannerAction() {
        guard let banner = connectionBanner else { return }
        switch banner.kind {
        case .reconnect:
            Task { await syncConnectionsStore.reconnect(connection: banner.connection) }
        case .consentRequired:
            openExternalURLHandler?(CalendarConnectionBanner.consentHelpURL)
        case .importFailed, .delayed:
            Task { await syncConnectionsStore.refresh() }
        }
    }

    /// Web `TimezoneMismatchBannerGate`.
    public var timezoneMismatchCopy: TimezoneMismatch.Copy? {
        guard viewStore.view != .life,
              TimezoneMismatch.shouldShow(
                pinned: viewStore.pinnedTimeZone,
                device: viewStore.browserTimeZone,
                snoozedFor: timezoneMismatchSnoozedFor),
              let pinned = viewStore.pinnedTimeZone
        else { return nil }
        return TimezoneMismatch.copy(device: viewStore.browserTimeZone, calendar: pinned, at: referenceNow)
    }

    public func switchToDeviceTimeZone() {
        settingsStore.setPinnedTimeZone(viewStore.browserTimeZone)
    }

    public func keepPinnedTimeZone() {
        UserDefaults.standard.set(viewStore.browserTimeZone, forKey: CompassStorageKeys.timezoneMismatchSnoozedBrowser)
        timezoneMismatchSnoozedFor = viewStore.browserTimeZone
    }

    /// Web `useNoticeActionShortcut`: a visible notice's CTA runs from its bare
    /// letter, standing down while event jump or an `e` sequence owns letters.
    public func handleNoticeActionKey(_ event: KeyEvent, editSequenceArmed: Bool) -> Bool {
        guard event.modifiers.isEmpty, !event.isRepeat, !editSequenceArmed,
              !eventJumpSelection.isActive, draftStore.gridDraft == nil else { return false }
        if event.key == .named(.escape), showsLocalModeConnectPrompt {
            onboardingStore.dismissLocalModeConnectPrompt()
            return true
        }
        guard case .character(let raw) = event.key else { return false }
        switch Character(String(raw).lowercased()) {
        case "g" where connectionBanner != nil:
            runConnectionBannerAction()
        case "o" where showsDemoEventsBanner && viewStore.view != .life:
            dismissDemoEventsBanner()
        case "/" where showsMeetingPageNudge:
            openBookingSettings()
        case "s" where showsLocalModeConnectPrompt:
            startTrialFromLocalModePrompt()
        case "h" where timezoneMismatchCopy != nil:
            switchToDeviceTimeZone()
        case "p" where timezoneMismatchCopy != nil:
            keepPinnedTimeZone()
        default:
            return false
        }
        return true
    }
}
