import CompassData
import CompassKit
import SwiftUI

struct EventFormScheduleSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft

    private var scheduleLocked: Bool {
        model.isScheduleLocked(for: draft)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if draft.schedule.kind == .timed {
                timedRangeRow
            } else {
                allDayDateRow
            }

            HStack(spacing: 6) {
                Toggle("All day?", isOn: Binding(
                    get: { draft.schedule.kind == .allDay },
                    set: { model.setDraftAllDay($0) }
                ))
                .toggleStyle(.checkbox)
                .disabled(scheduleLocked)
                .accessibilityIdentifier("compass-event-form-allday")

                if !scheduleLocked {
                    HStack(spacing: 4) {
                        ForEach(["Mod", "Alt", "A"], id: \.self) { key in
                            ShortcutHintChip(label: KeycapGlyphs.display([key]))
                        }
                    }
                    .accessibilityIdentifier("compass-event-form-allday-shortcut")
                }
            }

            if scheduleLocked {
                Text(
                    ProviderManagedScheduleCopy.note(
                        for: model.attendeeCalendar(for: draft)
                    )
                )
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
                .accessibilityIdentifier("compass-event-form-schedule-locked-note")
            }
        }
    }

    private var allDayDateRow: some View {
        HStack(spacing: 8) {
            EventFormCompactDateField(
                date: Binding(
                    get: { draft.schedule.start },
                    set: { model.updateAllDayDraftStart($0) }
                ),
                accessibilityIdentifier: "compass-event-form-start",
                keyOwner: $model.eventFormDateKeyOwner
            )
            .disabled(scheduleLocked)
            .pageJumpChipAnchor(id: "form-start")

            EventFormCompactDateField(
                date: Binding(
                    get: {
                        EffectiveTimeZone.calendar.date(byAdding: .day, value: -1, to: draft.schedule.end)
                            ?? draft.schedule.start
                    },
                    set: { model.updateAllDayDraftEnd($0) }
                ),
                accessibilityIdentifier: "compass-event-form-end",
                keyOwner: $model.eventFormDateKeyOwner
            )
            .disabled(scheduleLocked)
            .pageJumpChipAnchor(id: "form-end")
        }
    }

    private var timedRangeRow: some View {
        let calendar = EffectiveTimeZone.calendar
        let startDay = calendar.startOfDay(for: draft.schedule.start)
        let endDay = calendar.startOfDay(for: draft.schedule.end)
        let spansMultipleDays = startDay != endDay

        return EventFormScheduleFlowLayout(spacing: 8) {
            EventFormCompactDateField(
                date: Binding(
                    get: { draft.schedule.start },
                    set: { updateStart(mergeCalendarDay(into: draft.schedule.start, day: $0)) }
                ),
                accessibilityIdentifier: "compass-event-form-start-date",
                keyOwner: $model.eventFormDateKeyOwner
            )
            .disabled(scheduleLocked)
            .pageJumpChipAnchor(id: "form-start")

            EventFormTimeField(
                date: Binding(
                    get: { draft.schedule.start },
                    set: { updateStart($0) }
                ),
                accessibilityIdentifier: "compass-event-form-start",
                keyOwner: $model.eventFormTimeKeyOwner
            )
            .disabled(scheduleLocked)

            Text("-")
                .font(.rubik(NativeWebLayoutTokens.fontSizeBody))
                .foregroundStyle(theme.textMutedColor)

            if spansMultipleDays {
                EventFormCompactDateField(
                    date: Binding(
                        get: { draft.schedule.end },
                        set: { updateEnd(mergeCalendarDay(into: draft.schedule.end, day: $0)) }
                    ),
                    accessibilityIdentifier: "compass-event-form-end-date",
                    keyOwner: $model.eventFormDateKeyOwner
                )
                .disabled(scheduleLocked)
            }

            EventFormTimeField(
                date: Binding(
                    get: { draft.schedule.end },
                    set: { updateEnd($0) }
                ),
                accessibilityIdentifier: "compass-event-form-end",
                keyOwner: $model.eventFormTimeKeyOwner
            )
            .disabled(scheduleLocked)
            .pageJumpChipAnchor(id: "form-end")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mergeCalendarDay(into scheduleDate: Date, day: Date) -> Date {
        var calendar = EffectiveTimeZone.calendar
        let time = calendar.dateComponents([.hour, .minute, .second], from: scheduleDate)
        var dayComponents = calendar.dateComponents([.year, .month, .day], from: day)
        dayComponents.hour = time.hour
        dayComponents.minute = time.minute
        dayComponents.second = time.second ?? 0
        return calendar.date(from: dayComponents) ?? day
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

}
