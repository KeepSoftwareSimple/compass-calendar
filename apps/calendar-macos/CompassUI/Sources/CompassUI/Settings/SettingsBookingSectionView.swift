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

    private var addressPrefix: String {
        BookingCalendarLogic.bookingAddressPrefix(
            publicBookingURL: AdminBookingPageLogic.publicBookingURL(model.bookingStore.serverPage)
        )
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            if model.bookingStore.isLoadingPage, model.bookingStore.serverPage == nil {
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
            await model.bookingStore.refreshPageIfNeeded()
            model.bookingStore.seedFormIfNeeded(
                calendars: model.calendars,
                hasConnectedAccount: !model.syncConnectionsStore.connections.isEmpty
            )
            model.bookingStore.trackSettingsOpenedIfNeeded(
                hasConnection: !model.syncConnectionsStore.connections.isEmpty
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

    private var configuredForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(
                "Meeting page enabled",
                isOn: Binding(
                    get: { model.bookingStore.form.enabled },
                    set: { model.bookingStore.form.enabled = $0 }
                )
            )
            HStack {
                Text(addressPrefix)
                    .foregroundStyle(theme.textMutedColor)
                TextField("slug", text: slugBinding)
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
                value: weeklyBinding,
                disabled: model.bookingStore.isSaving
            )
            Picker("Duration", selection: durationBinding) {
                ForEach(BookingSettingsFormLogic.durationOptions, id: \.rawValue) { option in
                    Text("\(option.rawValue) min").tag(option)
                }
            }
            if !writableCalendars.isEmpty {
                Picker("Destination calendar", selection: destinationBinding) {
                    ForEach(writableCalendars, id: \.id) { calendar in
                        Text(calendar.name).tag(calendar.id)
                    }
                }
            }
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
        let step = model.bookingStore.setupStep ?? .address
        if step == .live {
            let ok = await save(enabling: true)
            if ok { model.bookingStore.setupStep = nil }
            return
        }
        if step == .address {
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

    private var slugBinding: Binding<String> {
        Binding(
            get: { model.bookingStore.form.slug ?? "" },
            set: { model.bookingStore.form.slug = $0.isEmpty ? nil : $0 }
        )
    }

    private var weeklyBinding: Binding<[BookingPageWeeklyAvailability]> {
        Binding(
            get: { model.bookingStore.form.weeklyAvailability },
            set: { model.bookingStore.form.weeklyAvailability = $0 }
        )
    }

    private var durationBinding: Binding<DurationMinutesEnum> {
        Binding(
            get: { model.bookingStore.form.durationMinutes },
            set: { model.bookingStore.form.durationMinutes = $0 }
        )
    }

    private var destinationBinding: Binding<String> {
        Binding(
            get: { model.bookingStore.form.destinationCalendarId },
            set: { newId in
                model.bookingStore.form.destinationCalendarId = newId
                model.bookingStore.form.blockingCalendarIds =
                    BookingCalendarLogic.defaultBlockingCalendarIds(
                        destinationCalendarId: newId,
                        calendars: model.calendars
                    )
            }
        )
    }
}

#if os(macOS)
import AppKit
#endif
