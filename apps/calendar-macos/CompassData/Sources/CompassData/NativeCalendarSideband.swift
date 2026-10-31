import CompassKit
import Foundation

public struct NativeUpNextState: Equatable, Sendable {
    public var snapshot: UpNextSnapshot
    public var nudgeWindow: UpNextNudgeWindow
    public var conferenceURL: String?
    public var referenceNow: Date

    public init(
        snapshot: UpNextSnapshot,
        nudgeWindow: UpNextNudgeWindow,
        conferenceURL: String?,
        referenceNow: Date
    ) {
        self.snapshot = snapshot
        self.nudgeWindow = nudgeWindow
        self.conferenceURL = conferenceURL
        self.referenceNow = referenceNow
    }
}

extension NativeCalendarRootModel {
    public var upNextState: NativeUpNextState {
        let now = referenceNow
        let eligible = upNextEligibleSidebandEvents()
        let candidates = UpNextProjection.timedCandidates(
            from: eligible,
            demoEventIds: demoEventIds)
        let snapshot = UpNextProjection.snapshot(now: now, timedCandidates: candidates)
        let nudgeWindow = UpNextProjection.nudgeWindow(
            now: now,
            timedCandidates: candidates)
        let conferenceURL: String? = {
            guard let upNext = snapshot.upNext,
                  let event = eligible.first(where: { $0.id.rawValue == upNext.id })
            else {
                return nil
            }
            return UpNextJoinURL.resolve(event: event)
        }()
        return NativeUpNextState(
            snapshot: snapshot,
            nudgeWindow: nudgeWindow,
            conferenceURL: conferenceURL,
            referenceNow: now)
    }

    public func sidebandTimedCandidates() -> [UpcomingNotifierLogic.TimedCandidate] {
        UpNextProjection.timedCandidates(
            from: upNextEligibleSidebandEvents(),
            demoEventIds: demoEventIds)
    }

    /// Same visibility as the time grid: hidden calendars and individually hidden events drop out.
    func upNextEligibleSidebandEvents() -> [Event] {
        eventsEligibleForUpNext(sidebandEvents)
    }

    func syncSidebandWithLoadedEvents() {
        guard isSignedIn || eventsStore.source == .local else { return }
        sidebandEvents = eventsInNotifiableRange(
            from: loadedEvents,
            range: CalendarWindowMath.notifiableEventQueryRange(now: referenceNow))
        onSidebandDidChange?()
    }

    public func refreshSideband() async {
        // The minute refresh advances the calendar's saved clock snapshot too,
        // and follows a device timezone change like web's 60s browser-zone poll.
        if !isDemoFixture {
            NSTimeZone.resetSystemTimeZone()
            viewStore.refreshBrowserTimeZone()
        }
        rebuildPresentation()
        let revision = sessionRevision
        guard isSignedIn || eventsStore.source == .local else {
            sidebandEvents = []
            return
        }
        let range = CalendarWindowMath.notifiableEventQueryRange(now: referenceNow)
        let key = EventRangeQueryKey(
            scope: .day,
            source: .remote,
            start: range.startDate,
            end: range.endDate)
        do {
            _ = try await eventsStore.loadRange(key: key)
            guard revision == sessionRevision, isSignedIn || eventsStore.source == .local else { return }
            let all = try eventsStore.fetchAllEvents()
            sidebandEvents = eventsInNotifiableRange(from: all, range: range)
        } catch {
            guard revision == sessionRevision else { return }
            sidebandEvents = []
        }
        onSidebandDidChange?()
    }

    public func handleDeepLink(_ urlString: String) {
        if DesktopDeepLinkParser.isBillingCheckoutDeepLink(urlString) {
            billingStore.handleBillingCheckoutDeepLink(urlString)
            return
        }
        if urlString.contains("compass://auth/") {
            Task {
                _ = await authStore.handleOAuthDeepLink(urlString)
            }
            return
        }
        if urlString.contains("compass://connect/") {
            Task {
                _ = await syncConnectionsStore.handleConnectDeepLink(urlString)
                await refreshCalendarsAndVisibleRange()
            }
            return
        }
        if let eventId = DesktopDeepLinkParser.parseEventId(from: urlString) {
            focusEventDeepLink(eventId: eventId)
            return
        }
        if let path = DesktopDeepLinkParser.navigationPath(for: urlString),
           path.hasPrefix("/day/")
        {
            let day = String(path.dropFirst("/day/".count))
            if let date = CompassDateParsing.parseInEffectiveTimeZone(day) {
                goToDate(date)
            }
        }
    }

    public func openUpNextEvent() {
        let window = upNextState.nudgeWindow
        if window.occurrences.count > 1 {
            pointerHintStore.hide()
            isUpNextPickerPresented = true
            upNextPickerHighlightIndex = 0
            return
        }
        guard let upNext = window.primary else { return }
        focusEventDeepLink(eventId: upNext.id)
    }

    public func closeUpNextPicker() {
        isUpNextPickerPresented = false
    }

    public func selectUpNextPicker(eventId: String) {
        isUpNextPickerPresented = false
        focusEventDeepLink(eventId: eventId)
    }

    public func upNextEventHasMeetingLink(eventId: String) -> Bool {
        guard let event = upNextEligibleSidebandEvents().first(where: { $0.id.rawValue == eventId })
        else { return false }
        return UpNextJoinURL.resolve(event: event) != nil
    }

    public func joinUpNextMeeting() {
        guard let urlString = upNextState.conferenceURL,
              let url = URL(string: urlString)
        else {
            return
        }
        openExternalURLHandler?(url)
    }

    public func upNextBannerShown(_ event: NotifiableEvent) {
        onUpNextBannerShown?(event)
    }

    private func eventsInNotifiableRange(
        from events: [Event],
        range: (startDate: String, endDate: String)
    ) -> [Event] {
        events.filter {
            EventScheduleBounds.intersectsQueryRange(
                event: $0,
                start: range.startDate,
                end: range.endDate)
        }
    }

    private func focusEventDeepLink(eventId: String) {
        guard let event = sidebandEvents.first(where: { $0.id.rawValue == eventId })
            ?? loadedEvents.first(where: { $0.id.rawValue == eventId })
        else {
            return
        }
        if case .timed(let payload) = event.schedule,
           let start = CompassDateParsing.parseInEffectiveTimeZone(payload.start.rawValue)
        {
            goToDate(start)
        }
    }
}
