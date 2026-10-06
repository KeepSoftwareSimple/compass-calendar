import CompassData
import CompassKit
import SwiftUI

struct BookingSetupWizardView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var bookingStore: BookingStore
    let writableCalendars: [CompassCalendar]
    let writableCalendarCount: Int
    let addressPrefix: String
    let onContinue: () -> Void
    let onBack: () -> Void

    private var step: BookingSetupStepId {
        bookingStore.setupStep ?? .address
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            let progress = BookingSetupSteps.setupStepProgress(
                stepId: step,
                writableCalendarCount: writableCalendarCount
            )
            Text("Step \(progress.current) of \(progress.total)")
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textMutedColor)
            Text(BookingSetupSteps.setupStepSentence(step, writableCalendarCount: writableCalendarCount))
                .font(.custom("Rubik", size: 14))
                .foregroundStyle(theme.textColor)
            stepContent
            if let saveErrorMessage = bookingStore.saveErrorMessage {
                Text(saveErrorMessage)
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.errorColor)
            }
            HStack {
                if step != .address {
                    Button("Back", action: onBack)
                        .buttonStyle(.plain)
                        .foregroundStyle(theme.textMutedColor)
                }
                Spacer()
                Button(step == .live ? "Turn on" : "Continue", action: onContinue)
                    .buttonStyle(.borderedProminent)
                    .disabled(bookingStore.isSaving)
            }
        }
        .accessibilityIdentifier("booking-setup-wizard")
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .address:
            HStack(spacing: 4) {
                Text(addressPrefix)
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
                TextField("your-name", text: slugBinding)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("booking-address-field")
            }
        case .hours:
            BookingWeeklyHoursEditorView(
                value: weeklyBinding,
                disabled: bookingStore.isSaving
            )
        case .duration:
            Picker("Duration", selection: durationBinding) {
                ForEach(BookingSettingsFormLogic.durationOptions, id: \.rawValue) { option in
                    Text("\(option.rawValue) minutes").tag(option)
                }
            }
            .pickerStyle(.radioGroup)
        case .destination:
            if writableCalendarCount == 0 {
                Text("Connect a calendar account from Accounts settings first.")
                    .font(.custom("Rubik", size: 13))
                    .foregroundStyle(theme.textMutedColor)
            } else {
                Picker("Destination", selection: destinationBinding) {
                    ForEach(writableCalendars, id: \.id) { calendar in
                        Text(calendar.name).tag(calendar.id)
                    }
                }
            }
        case .live:
            VStack(alignment: .leading, spacing: 6) {
                summaryRow("Address", "\(addressPrefix)\(bookingStore.form.slug ?? "")")
                summaryRow("Duration", "\(bookingStore.form.durationMinutes.rawValue) min")
                summaryRow("Timezone", bookingStore.form.timeZone.rawValue)
                let slots = bookingStore.previewSlotStarts()
                summaryRow("Preview slots (7 days)", "\(slots.count) available")
            }
        }
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .frame(width: 120, alignment: .leading)
                .foregroundStyle(theme.textMutedColor)
            Text(value)
                .foregroundStyle(theme.textColor)
        }
        .font(.custom("Rubik", size: 13))
    }

    private var slugBinding: Binding<String> {
        Binding(
            get: { bookingStore.form.slug ?? "" },
            set: { bookingStore.form.slug = $0.isEmpty ? nil : $0 }
        )
    }

    private var weeklyBinding: Binding<[BookingPageWeeklyAvailability]> {
        Binding(
            get: { bookingStore.form.weeklyAvailability },
            set: { bookingStore.form.weeklyAvailability = $0 }
        )
    }

    private var durationBinding: Binding<DurationMinutesEnum> {
        Binding(
            get: { bookingStore.form.durationMinutes },
            set: { bookingStore.form.durationMinutes = $0 }
        )
    }

    private var destinationBinding: Binding<String> {
        Binding(
            get: { bookingStore.form.destinationCalendarId },
            set: { newId in
                bookingStore.form.destinationCalendarId = newId
                bookingStore.form.blockingCalendarIds =
                    BookingCalendarLogic.defaultBlockingCalendarIds(
                        destinationCalendarId: newId,
                        calendars: writableCalendars
                    )
            }
        )
    }
}
