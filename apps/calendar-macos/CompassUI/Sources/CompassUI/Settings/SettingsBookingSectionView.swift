import CompassData
import CompassKit
import SwiftUI

public struct SettingsBookingSectionView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    private var writableCalendars: [CompassCalendar] {
        model.bookingStore.writableCalendars(
            from: model.calendars,
            hasConnectedAccount: !model.syncConnectionsStore.connections.isEmpty
        )
    }

    private var availabilityCalendars: [CompassCalendar] {
        BookingCalendarLogic.availabilityReadableCalendars(model.calendars)
    }

    private var addressPrefix: String {
        BookingCalendarLogic.bookingAddressPrefix(
            publicBookingURL: AdminBookingPageLogic.publicBookingURL(model.bookingStore.serverPage)
        )
    }

    private var hasHealthyConnection: Bool {
        BookingConnectionHealth.hasHealthyConnection(
            connections: model.syncConnectionsStore.connections
        )
    }

    private var guestPreview: Bool {
        model.settingsStore.guestMeetingSetupActive && !model.isSignedIn
    }

    private var showFirstRunConnectPrompt: Bool {
        guard !guestPreview else { return false }
        guard !hasHealthyConnection else { return false }
        if let page = model.bookingStore.serverPage {
            return AdminBookingPageLogic.isUnconfiguredPage(page)
        }
        return !model.bookingStore.isLoadingPage && model.bookingStore.serverPage == nil
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            if showFirstRunConnectPrompt {
                BookingConnectPromptView(
                    connectableProviders: model.connectableCalendarProviders,
                    isBusy: model.syncConnectionsStore.isBusy,
                    onConnect: { provider in
                        Task { await model.syncConnectionsStore.connect(provider: provider) }
                    }
                )
            } else if model.bookingStore.isLoadingPage, model.bookingStore.serverPage == nil {
                Text("Loading meeting settings…")
                    .foregroundStyle(theme.textMutedColor)
            } else if model.bookingStore.setupStep != nil {
                wizard
            } else {
                configuredForm
            }
        }
        .accessibilityIdentifier("settings-section-booking")
        .task {
            if guestPreview {
                model.bookingStore.seedGuestPreviewIfNeeded()
            } else {
                await model.refreshBookingSettingsContent()
                model.bookingStore.syncDiscoveredBlockingCalendars(
                    availabilityCalendars: availabilityCalendars
                )
            }
        }
        .onChange(of: model.calendars.map(\.id)) { _, _ in
            model.bookingStore.syncDiscoveredBlockingCalendars(
                availabilityCalendars: availabilityCalendars
            )
        }
        .overlay {
            if model.bookingStore.isDiscardConfirmationPresented {
                discardDialog
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Meetings")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            if model.bookingStore.bookingNeedsAttention {
                Text("Your meeting page needs attention.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.warningColor)
            } else if model.bookingStore.isLive {
                Text("Your meeting page is live.")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
            }
        }
    }

    private var wizard: some View {
        BookingSetupWizardView(
            bookingStore: model.bookingStore,
            writableCalendars: writableCalendars,
            writableCalendarCount: writableCalendars.count,
            addressPrefix: addressPrefix,
            onContinue: { Task { await handleWizardContinue() } },
            onBack: {
                _ = model.bookingStore.retreatSetupStep(
                    writableCalendarCount: writableCalendars.count
                )
            }
        )
    }

    private var savedMeetingLinkUrl: String? {
        if model.bookingStore.isLive,
           case let .saved(saved) = model.bookingStore.serverPage
        {
            return saved.bookingUrl
        }
        return nil
    }

    private var addressPreview: String? {
        guard let slug = model.bookingStore.form.slug, !slug.isEmpty else { return nil }
        return "\(addressPrefix)\(slug)"
    }

    private var configuredForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            BookingStatusHeaderView(
                bookingStore: model.bookingStore,
                savedUrl: savedMeetingLinkUrl,
                addressPreview: addressPreview,
                connections: model.syncConnectionsStore.connections,
                calendars: model.calendars,
                connectableProviders: model.connectableCalendarProviders,
                isConnectBusy: model.syncConnectionsStore.isBusy,
                onToggle: { enabled in
                    Task {
                        _ = await model.bookingStore.save(
                            enabling: enabled,
                            writableCalendars: writableCalendars
                        )
                    }
                },
                onConnect: { provider in
                    Task { await model.syncConnectionsStore.connect(provider: provider) }
                },
                onReconnect: { connection in
                    Task { await model.syncConnectionsStore.reconnect(connection: connection) }
                }
            )
            HStack {
                Text(addressPrefix)
                    .foregroundStyle(theme.textMutedColor)
                TextField("slug", text: model.bookingStore.form.slugBinding)
                    .textFieldStyle(.roundedBorder)
            }
            if let link = model.bookingStore.meetingLinkURL(calendars: model.calendars) {
                HStack {
                    Text(link.absoluteString)
                        .font(.custom("Rubik", size: 11))
                        .foregroundStyle(theme.textMutedColor)
                        .lineLimit(1)
                    Button("Copy link") {
                        copyLink(link)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.accentColor)
                }
            }
            BookingWeeklyHoursEditorView(
                value: model.bookingStore.form.weeklyBinding,
                disabled: model.bookingStore.isSaving
            )
            Picker("Duration", selection: model.bookingStore.form.durationBinding) {
                ForEach(BookingSettingsFormLogic.durationOptions, id: \.rawValue) { option in
                    Text("\(option.rawValue) min").tag(option)
                }
            }
            if !writableCalendars.isEmpty {
                Picker("Destination calendar", selection: model.bookingStore.form.destinationBinding(calendars: model.calendars)) {
                    ForEach(writableCalendars, id: \.id) { calendar in
                        Text(calendar.name).tag(calendar.id)
                    }
                }
            }
            BookingBlockingCalendarsFieldView(
                availabilityCalendars: availabilityCalendars,
                blockingCalendarIds: model.bookingStore.form.blockingCalendarIds,
                connections: model.syncConnectionsStore.connections,
                onToggle: { calendarId, checked in
                    model.bookingStore.toggleBlockingCalendar(
                        calendarId: calendarId,
                        checked: checked
                    )
                }
            )
            HStack {
                labeledNumberField("Min notice (hours)", text: minNoticeBinding)
                labeledNumberField("Horizon (days)", text: horizonBinding)
            }
            let previewCount = model.bookingStore.previewSlotStarts().count
            Text("Slot preview (next 7 days): \(previewCount) starts")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            if let message = model.bookingStore.saveErrorMessage {
                Text(message)
                    .foregroundStyle(theme.errorColor)
                    .font(.custom("Rubik", size: 12))
            }
            HStack {
                Spacer()
                Button("Save changes") {
                    Task { await save(enabling: false) }
                }
                .disabled(model.bookingStore.isSaving || !model.bookingStore.isDirty)
            }
        }
    }

    private func labeledNumberField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading) {
            Text(label)
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            TextField(label, text: text)
                .textFieldStyle(.roundedBorder)
                .frame(width: 140)
        }
    }

    private var discardDialog: some View {
        ZStack {
            theme.overlayBackdropColor.ignoresSafeArea()
            VStack(spacing: 12) {
                Text("Discard unsaved changes?")
                    .font(.custom("Rubik", size: 15))
                HStack {
                    Button("Keep editing") {
                        model.bookingStore.isDiscardConfirmationPresented = false
                    }
                    Button("Discard", role: .destructive) {
                        model.bookingStore.confirmDiscard()
                        model.settingsStore.close()
                    }
                }
            }
            .padding(20)
            .background(theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func handleWizardContinue() async {
        model.bookingStore.persistGuestDraftIfNeeded(guestPreview: guestPreview)
        let step = model.bookingStore.setupStep ?? .address
        if step == .live {
            if guestPreview {
                model.settingsStore.closeForGuestAuthHandoff()
                model.authStore.openModal(.signUp)
                return
            }
            let ok = await save(enabling: true)
            if ok {
                model.bookingStore.setupStep = nil
                model.settingsStore.clearGuestMeetingSetup()
            }
            return
        }
        if step == .address {
            if guestPreview {
                model.bookingStore.advanceSetupStep(writableCalendarCount: writableCalendars.count)
                return
            }
            let ok = await save(enabling: false)
            if !ok { return }
        }
        model.bookingStore.advanceSetupStep(writableCalendarCount: writableCalendars.count)
    }

    private func save(enabling: Bool) async -> Bool {
        await model.bookingStore.save(
            enabling: enabling,
            writableCalendars: writableCalendars
        )
    }

    private var minNoticeBinding: Binding<String> {
        Binding(
            get: { model.bookingStore.minNoticeText },
            set: { model.bookingStore.minNoticeText = $0 }
        )
    }

    private var horizonBinding: Binding<String> {
        Binding(
            get: { model.bookingStore.horizonText },
            set: { model.bookingStore.horizonText = $0 }
        )
    }

    private func copyLink(_ url: URL) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
        #endif
        model.bookingStore.trackLinkCopied()
    }
}

#if os(macOS)
import AppKit
#endif
