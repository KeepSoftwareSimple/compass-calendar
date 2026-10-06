import CompassKit
import Foundation

@MainActor
@Observable
public final class BookingStore {
    public private(set) var serverPage: AdminBookingPage?
    public private(set) var status: BookingPageStatusResponse?
    public private(set) var isLoadingPage = false
    public private(set) var pageLoadFailed = false
    public private(set) var isLoadingStatus = false
    public private(set) var isSaving = false
    public private(set) var saveErrorMessage: String?
    public let form: BookingSettingsForm
    public var minNoticeText: String
    public var horizonText: String
    public var setupStep: BookingSetupStepId?
    public var isDiscardConfirmationPresented = false

    private var baselineInput: AdminPutBookingPageInput?
    private var optedOutBlockingCalendarIds: Set<String> = []
    private let bookingAPI: BookingAPI
    private let analytics: ProductAnalyticsClient
    private var authenticated = false
    private var seededPage: AdminBookingPage?
    private var didTrackSettingsOpened = false

    public init(
        apiClient: CompassAPIClient,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient()
    ) {
        bookingAPI = BookingAPI(client: apiClient)
        self.analytics = analytics
        let defaultForm = BookingSettingsFormLogic.buildDefaultInput(
            timeZone: EffectiveTimeZone.identifier
        )
        form = BookingSettingsForm(from: defaultForm)
        minNoticeText = String(defaultForm.minNoticeHours)
        horizonText = String(defaultForm.maxHorizonDays)
    }

    public var isLive: Bool {
        AdminBookingPageLogic.isLivePage(serverPage)
    }

    public var bookingNeedsAttention: Bool {
        isLive && status?.bookable == false
    }

    public var isDirty: Bool {
        guard let baselineInput else { return false }
        return BookingSettingsFormLogic.isFormDirty(
            form: form.putInput,
            baseline: baselineInput,
            minNoticeText: minNoticeText,
            horizonText: horizonText
        )
    }

    public func setAuthenticated(_ value: Bool) {
        authenticated = value
        if !value {
            serverPage = nil
            status = nil
            setupStep = nil
            seededPage = nil
            didTrackSettingsOpened = false
        }
    }

    public func refreshPageIfNeeded() async {
        guard authenticated else { return }
        await refreshPage()
    }

    public func refreshPage() async {
        guard authenticated else { return }
        isLoadingPage = true
        pageLoadFailed = false
        defer { isLoadingPage = false }
        do {
            serverPage = try await bookingAPI.getPage()
            if isLive {
                await refreshStatus()
            }
        } catch {
            pageLoadFailed = true
        }
    }

    public func refreshStatus() async {
        guard authenticated, isLive else { return }
        isLoadingStatus = true
        defer { isLoadingStatus = false }
        status = try? await bookingAPI.getPageStatus()
    }

    public func seedFormIfNeeded(
        calendars: [CompassCalendar],
        hasConnectedAccount: Bool
    ) {
        guard authenticated, let serverPage, setupStep == nil else { return }
        guard seededPage != serverPage else { return }
        seededPage = serverPage
        let writable = BookingCalendarLogic.writableCalendars(
            calendars,
            hasConnectedAccount: hasConnectedAccount
        )
        let availability = BookingCalendarLogic.availabilityReadableCalendars(calendars)
        let seeded = BookingSettingsFormLogic.buildInitialForm(
            page: serverPage,
            effectiveTimeZone: EffectiveTimeZone.identifier,
            writableCalendars: writable,
            availabilityCalendars: availability
        )
        form.apply(seeded)
        minNoticeText = String(seeded.minNoticeHours)
        horizonText = String(seeded.maxHorizonDays)
        baselineInput = seeded
        let eligible = availability.map(\.id)
        optedOutBlockingCalendarIds = Set(
            MergeBlockingCalendars.nextOptedOutBlockingCalendarIds(
                previousOptedOut: [],
                eligible: eligible,
                submitted: seeded.blockingCalendarIds
            )
        )
        if AdminBookingPageLogic.isUnconfiguredPage(serverPage) {
            setupStep = setupStep ?? .address
        }
    }

    public func trackSettingsOpenedIfNeeded(hasConnection: Bool) {
        guard !didTrackSettingsOpened, let serverPage else { return }
        didTrackSettingsOpened = true
        analytics.track(
            .bookingSettingsOpened,
            properties: [
                "has_connection": .bool(hasConnection),
                "is_live": .bool(isLive),
                "is_bookable": .bool(status?.bookable == true),
                "configured_host": .bool(!AdminBookingPageLogic.isUnconfiguredPage(serverPage)),
            ]
        )
    }

    public func writableCalendars(
        from calendars: [CompassCalendar],
        hasConnectedAccount: Bool
    ) -> [CompassCalendar] {
        BookingCalendarLogic.writableCalendars(calendars, hasConnectedAccount: hasConnectedAccount)
    }

    public func meetingLinkURL(calendars _: [CompassCalendar]) -> URL? {
        if isLive, case let .saved(saved) = serverPage {
            return URL(string: saved.bookingUrl)
        }
        guard let slug = form.slug, !slug.isEmpty else { return nil }
        let prefix = BookingCalendarLogic.bookingAddressPrefix(
            publicBookingURL: AdminBookingPageLogic.publicBookingURL(serverPage)
        )
        return URL(string: "\(prefix)\(slug)")
    }

    public func trackLinkCopied() {
        analytics.track(.bookingLinkCopied, properties: [:])
    }

    public func advanceSetupStep(writableCalendarCount: Int) {
        guard let current = setupStep else { return }
        analytics.track(.bookingSetupStepCompleted, properties: ["step": .string(current.rawValue)])
        setupStep = BookingSetupSteps.nextSetupStep(current, writableCalendarCount: writableCalendarCount)
        if let setupStep {
            analytics.track(
                .bookingSetupStepViewed,
                properties: ["step": .string(setupStep.rawValue)]
            )
        }
    }

    public func retreatSetupStep(writableCalendarCount: Int) -> Bool {
        guard let current = setupStep else { return false }
        if current == .address { return false }
        setupStep = BookingSetupSteps.prevSetupStep(current, writableCalendarCount: writableCalendarCount)
        return true
    }

    public func attemptDismissSettings(writableCalendarCount: Int) -> Bool {
        if let setupStep, setupStep != .address {
            _ = retreatSetupStep(writableCalendarCount: writableCalendarCount)
            return true
        }
        if isDirty {
            isDiscardConfirmationPresented = true
            return true
        }
        return false
    }

    public func confirmDiscard() {
        isDiscardConfirmationPresented = false
        if let baselineInput {
            form.apply(baselineInput)
            minNoticeText = String(baselineInput.minNoticeHours)
            horizonText = String(baselineInput.maxHorizonDays)
        }
        setupStep = nil
    }

    @discardableResult
    public func save(
        enabling: Bool,
        writableCalendars: [CompassCalendar]
    ) async -> Bool {
        let minNotice = BookingSettingsFormLogic.parseBookingCount(
            minNoticeText,
            min: 0,
            max: BookingSettingsFormLogic.maxMinNoticeHours
        )
        let horizon = BookingSettingsFormLogic.parseBookingCount(
            horizonText,
            min: 1,
            max: BookingSettingsFormLogic.maxHorizonDays
        )
        let minNoticeInvalid = minNotice == nil
        let horizonInvalid = horizon == nil
        let base = form.putInput
        let payload = AdminPutBookingPageInput(
            blockingCalendarIds: base.blockingCalendarIds,
            destinationCalendarId: base.destinationCalendarId,
            durationMinutes: base.durationMinutes,
            enabled: enabling ? true : base.enabled,
            maxHorizonDays: horizon ?? base.maxHorizonDays,
            minNoticeHours: minNotice ?? base.minNoticeHours,
            slug: base.slug,
            timeZone: base.timeZone,
            weeklyAvailability: base.weeklyAvailability
        )

        if let message = BookingSettingsFormLogic.validateForm(
            form: payload,
            enabling: enabling,
            minNoticeInvalid: minNoticeInvalid,
            horizonInvalid: horizonInvalid,
            writableCalendars: writableCalendars
        ) {
            saveErrorMessage = message
            return false
        }

        isSaving = true
        saveErrorMessage = nil
        defer { isSaving = false }
        do {
            let result = try await bookingAPI.putPage(payload)
            serverPage = result
            seededPage = result
            form.apply(payload)
            baselineInput = payload
            minNoticeText = String(payload.minNoticeHours)
            horizonText = String(payload.maxHorizonDays)
            if enabling {
                analytics.track(.bookingPageEnabled, properties: [:])
            }
            analytics.track(.bookingSetupSaveSucceeded, properties: [:])
            if setupStep == .live {
                setupStep = nil
            }
            if AdminBookingPageLogic.isLivePage(result) {
                await refreshStatus()
            }
            return true
        } catch {
            saveErrorMessage = "Could not save meeting settings. Try again."
            analytics.track(.bookingSetupSaveFailed, properties: [:])
            return false
        }
    }

    public func syncDiscoveredBlockingCalendars(availabilityCalendars: [CompassCalendar]) {
        guard setupStep == nil else { return }
        let discovered = availabilityCalendars.map(\.id)
        guard let merged = MergeBlockingCalendars.withDiscoveredBlockingCalendarIds(
            blockingCalendarIds: form.blockingCalendarIds,
            optedOut: Array(optedOutBlockingCalendarIds),
            discovered: discovered
        ) else { return }
        form.blockingCalendarIds = merged
        if let baselineInput {
            if let baselineMerged = MergeBlockingCalendars.withDiscoveredBlockingCalendarIds(
                blockingCalendarIds: baselineInput.blockingCalendarIds,
                optedOut: Array(optedOutBlockingCalendarIds),
                discovered: discovered
            ) {
                self.baselineInput = baselineInput.withBlockingCalendarIds(baselineMerged)
            }
        }
    }

    public func toggleBlockingCalendar(calendarId: String, checked: Bool) {
        if checked {
            optedOutBlockingCalendarIds.remove(calendarId)
        } else {
            optedOutBlockingCalendarIds.insert(calendarId)
        }
        var ids = Set(form.blockingCalendarIds)
        if checked {
            ids.insert(calendarId)
        } else {
            ids.remove(calendarId)
        }
        form.blockingCalendarIds = Array(ids)
    }

    public func previewSlotStarts(now: Date = Date()) -> [String] {
        let windowStart = now
        let windowEnd = Calendar.current.date(byAdding: .day, value: 7, to: now) ?? now
        let payload = form.putInput
        let input = ComputeBookingSlotsInput(
            timeZone: payload.timeZone.rawValue,
            durationMinutes: payload.durationMinutes.rawValue,
            weeklyAvailability: payload.weeklyAvailability,
            minNoticeHours: payload.minNoticeHours,
            maxHorizonDays: payload.maxHorizonDays,
            busyIntervals: [],
            confirmedReservationStarts: [],
            now: now,
            windowStart: windowStart,
            windowEnd: windowEnd
        )
        return ComputeBookingSlots.computeBookingSlots(input)
    }
}

private extension AdminPutBookingPageInput {
    func withBlockingCalendarIds(_ ids: [String]) -> AdminPutBookingPageInput {
        AdminPutBookingPageInput(
            blockingCalendarIds: ids,
            destinationCalendarId: destinationCalendarId,
            durationMinutes: durationMinutes,
            enabled: enabled,
            maxHorizonDays: maxHorizonDays,
            minNoticeHours: minNoticeHours,
            slug: slug,
            timeZone: timeZone,
            weeklyAvailability: weeklyAvailability
        )
    }
}
