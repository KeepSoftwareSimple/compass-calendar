import CompassData
import CompassKit
import SwiftUI

struct EventFormScheduleSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    private var scheduleLocked: Bool {
        model.isScheduleLocked(for: draft)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("All-day", isOn: Binding(
                get: { draft.schedule.kind == .allDay },
                set: { model.setDraftAllDay($0) }
            ))
            .toggleStyle(.switch)
            .disabled(scheduleLocked)
            .accessibilityIdentifier("compass-event-form-allday")

            if draft.schedule.kind == .timed {
                DatePicker(
                    "Start",
                    selection: Binding(
                        get: { draft.schedule.start },
                        set: { updateStart($0) }
                    ),
                    displayedComponents: [.date, .hourAndMinute]
                )
                .labelsHidden()
                .disabled(scheduleLocked)
                .accessibilityIdentifier("compass-event-form-start")
                .pageJumpChipAnchor(id: "form-start")

                DatePicker(
                    "End",
                    selection: Binding(
                        get: { draft.schedule.end },
                        set: { updateEnd($0) }
                    ),
                    displayedComponents: [.date, .hourAndMinute]
                )
                .labelsHidden()
                .disabled(scheduleLocked)
                .accessibilityIdentifier("compass-event-form-end")
                .pageJumpChipAnchor(id: "form-end")
            } else {
                DatePicker(
                    "Start day",
                    selection: Binding(
                        get: { draft.schedule.start },
                        set: { updateAllDayStart($0) }
                    ),
                    displayedComponents: [.date]
                )
                .labelsHidden()
                .disabled(scheduleLocked)
                .accessibilityIdentifier("compass-event-form-start")
            }

            if scheduleLocked {
                Text(
                    "Your calendar provider keeps this event updated (for example from an email), "
                        + "so its time follows the provider. Changes to the title, notes, and location stay in Compass."
                )
                .font(.custom("Rubik", size: 11))
                .foregroundStyle(theme.textMutedColor)
                .accessibilityIdentifier("compass-event-form-schedule-locked-note")
            }
        }
        .padding(12)
        .background(theme.surfacePanelColor)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(focusField == .start || focusField == .end ? theme.accentColor : theme.borderColor, lineWidth: 1)
        )
    }

    private func updateStart(_ date: Date) {
        var schedule = draft.schedule
        schedule.start = date
        if schedule.end <= date {
            schedule.end = DraftTiming.timedDraftEnd(start: date)
        }
        model.updateDraftFromForm(schedule: schedule)
    }

    private func updateEnd(_ date: Date) {
        var schedule = draft.schedule
        schedule.end = max(date, schedule.start.addingTimeInterval(60))
        model.updateDraftFromForm(schedule: schedule)
    }

    private func updateAllDayStart(_ date: Date) {
        let calendar = EffectiveTimeZone.calendar
        let start = calendar.startOfDay(for: date)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start
        model.updateDraftFromForm(
            schedule: DraftSchedule(start: start, end: end, kind: .allDay)
        )
    }
}
