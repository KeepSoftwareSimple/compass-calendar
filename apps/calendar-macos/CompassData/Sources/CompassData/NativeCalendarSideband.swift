import CompassKit
import Foundation

public struct NativeUpNextState: Equatable, Sendable {
    public var snapshot: UpNextSnapshot
    public var conferenceURL: String?
    public var referenceNow: Date

    public init(snapshot: UpNextSnapshot, conferenceURL: String?, referenceNow: Date) {
        self.snapshot = snapshot
        self.conferenceURL = conferenceURL
        self.referenceNow = referenceNow
    }
}

extension NativeCalendarRootModel {
    public var upNextState: NativeUpNextState {
        let now = referenceNow
        let candidates = UpNextProjection.timedCandidates(
            from: sidebandEvents,
            demoEventIds: demoEventIds)
        let snapshot = UpNextProjection.snapshot(now: now, timedCandidates: candidates)
        let conferenceURL: String? = {
            guard let upNext = snapshot.upNext,
                  let event = sidebandEvents.first(where: { $0.id.rawValue == upNext.id })
            else {
                return nil
            }
            return UpNextJoinURL.resolve(event: event)
        }()
        return NativeUpNextState(
            snapshot: snapshot,
            conferenceURL: conferenceURL,
            referenceNow: now)
    }

    public func sidebandTimedCandidates() -> [UpcomingNotifierLogic.TimedCandidate] {
        UpNextProjection.timedCandidates(from: sidebandEvents, demoEventIds: demoEventIds)
    }

    public func refreshSideband() async {
        guard isSignedIn else {
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
            let all = try eventsStore.fetchAllEvents()
            sidebandEvents = all.filter {
                EventScheduleBounds.intersectsQueryRange(
                    event: $0,
                    start: range.startDate,
                    end: range.endDate)
            }
        } catch {
            sidebandEvents = []
        }
        onSidebandDidChange?()
    }

    public var onSidebandDidChange: (() -> Void)?

    public func handleDeepLink(_ urlString: String) {
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

    public var openConferenceURLHandler: ((URL) -> Void)?
    public var onUpNextBannerShown: ((NotifiableEvent) -> Void)?

    public func openUpNextEvent() {
        guard let upNext = upNextState.snapshot.upNext else { return }
        focusEventDeepLink(eventId: upNext.id)
    }

    public func joinUpNextMeeting() {
        guard let urlString = upNextState.conferenceURL,
              let url = URL(string: urlString)
        else {
            return
        }
        openConferenceURLHandler?(url)
    }

    public func upNextBannerShown(_ event: NotifiableEvent) {
        onUpNextBannerShown?(event)
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
