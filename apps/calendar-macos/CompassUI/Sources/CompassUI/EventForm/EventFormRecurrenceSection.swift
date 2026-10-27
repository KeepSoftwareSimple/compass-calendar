import CompassData
import CompassKit
import SwiftUI

struct EventFormRecurrenceSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft

    @State private var pattern: RecurrenceRuleLine.Pattern = .init(frequency: .daily)
    @State private var hasRecurrence: Bool = false
    private enum Control: Hashable { case toggle, frequency }
    @FocusState private var focusedControl: Control?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                toggleRecurrence(!hasRecurrence)
            } label: {
                HStack(spacing: 4) {
                    PhosphorIconView(icon: .repeatIcon, size: 18)
                    Text("Repeat")
                        .font(.rubik(NativeWebLayoutTokens.fontSizeM))
                }
                .foregroundStyle(theme.textMutedColor.opacity(hasRecurrence ? 1 : 0.85))
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(hasRecurrence ? "Repeat" : "Edit recurrence")
            .accessibilityIdentifier("compass-event-form-recurrence-toggle")
            .focusable()
            .focusEffectDisabled()
            .focused($focusedControl, equals: .toggle)
            .onKeyPress(.return) {
                toggleRecurrence(!hasRecurrence)
                return .handled
            }
            .onKeyPress(.space) {
                toggleRecurrence(!hasRecurrence)
                return .handled
            }

            if hasRecurrence {
                Picker("Frequency", selection: $pattern.frequency) {
                    Text("Daily").tag(RecurrenceRuleLine.Frequency.daily)
                    Text("Weekly").tag(RecurrenceRuleLine.Frequency.weekly)
                    Text("Monthly").tag(RecurrenceRuleLine.Frequency.monthly)
                    Text("Yearly").tag(RecurrenceRuleLine.Frequency.yearly)
                }
                .pickerStyle(.menu)
                .focusable()
                .focused($focusedControl, equals: .frequency)
                .accessibilityIdentifier("compass-event-form-recurrence-frequency")
                .onChange(of: pattern.frequency) { _, _ in syncDraftRecurrence() }

                Stepper(
                    "Every \(pattern.interval)",
                    value: Binding(
                        get: { pattern.interval },
                        set: {
                            pattern.interval = max(1, min(12, $0))
                            syncDraftRecurrence()
                        }
                    ),
                    in: 1 ... 12
                )
                .accessibilityIdentifier("compass-event-form-recurrence-interval")

                if pattern.frequency == .weekly {
                    weekdayRow
                }

                Toggle("End date", isOn: Binding(
                    get: { pattern.until != nil },
                    set: { enabled in
                        pattern.until = enabled
                            ? RecurrenceRuleLine.inclusiveEndDate(
                                defaultUntil,
                                timeZoneIdentifier: EffectiveTimeZone.identifier)
                            : nil
                        if enabled { pattern.count = nil }
                        syncDraftRecurrence()
                    }
                ))
                .toggleStyle(.checkbox)
                .accessibilityIdentifier("compass-event-form-recurrence-has-until")

                if pattern.until != nil {
                    DatePicker(
                        "Ends on",
                        selection: Binding(
                            get: { pattern.until ?? defaultUntil },
                            set: {
                                pattern.until = RecurrenceRuleLine.inclusiveEndDate(
                                    $0,
                                    timeZoneIdentifier: EffectiveTimeZone.identifier)
                                pattern.count = nil
                                syncDraftRecurrence()
                            }
                        ),
                        in: EffectiveTimeZone.calendar.startOfDay(for: draft.schedule.start)...,
                        displayedComponents: [.date]
                    )
                    .accessibilityIdentifier("compass-event-form-recurrence-until")
                }

            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onKeyPress(keys: [.tab]) { press in
            guard hasRecurrence else { return .ignored }
            if focusedControl == .toggle, press.modifiers.isEmpty {
                focusedControl = .frequency
                return .handled
            }
            if focusedControl == .frequency, press.modifiers == .shift {
                focusedControl = .toggle
                return .handled
            }
            return .ignored
        }
        .overlay {
            if focusedControl == .toggle {
                RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                    .stroke(theme.accentColor, lineWidth: 1)
                    .padding(-4)
            }
        }
        .onAppear { reloadFromDraft() }
        .onChange(of: model.eventFormRecurrenceFocusRequest) { _, _ in
            // The parent releases title focus for the same request first.
            DispatchQueue.main.async {
                guard model.isEventFormVisible, model.eventFormFocusedField == .recurrence else { return }
                focusedControl = .toggle
            }
        }
        .onChange(of: draft.recurrence) { _, _ in reloadFromDraft() }
        .onChange(of: draft.schedule.start) { _, _ in syncDraftRecurrence() }
    }

    private var weekdayRow: some View {
        HStack(spacing: 4) {
            ForEach(weekdayLabels, id: \.index) { entry in
                let selected = pattern.byWeekday.contains(entry.index)
                Button(entry.label) {
                    if selected {
                        pattern.byWeekday.removeAll { $0 == entry.index }
                    } else {
                        pattern.byWeekday.append(entry.index)
                    }
                    syncDraftRecurrence()
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(selected ? theme.accentColor.opacity(0.2) : theme.surfaceColor.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .foregroundStyle(theme.textColor)
                .accessibilityLabel(entry.name)
                .accessibilityValue(selected ? "Selected" : "Not selected")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .accessibilityIdentifier("compass-event-form-recurrence-weekdays")
    }

    private var weekdayLabels: [(index: Int, label: String, name: String)] {
        [
            (0, "M", "Monday"), (1, "T", "Tuesday"), (2, "W", "Wednesday"),
            (3, "T", "Thursday"), (4, "F", "Friday"), (5, "S", "Saturday"), (6, "S", "Sunday"),
        ]
    }

    private var defaultUntil: Date {
        EffectiveTimeZone.calendar.date(byAdding: .month, value: 3, to: draft.schedule.start)
            ?? draft.schedule.start
    }

    private var currentRules: [String] {
        let baseline = model.baselineEvent(for: draft)
        return GridEventDraftRecurrence.resolvedRules(
            draft: draft,
            baselineEvent: baseline,
            seriesMaster: baseline.flatMap { model.seriesMaster(for: $0) }
        )
    }

    private func reloadFromDraft() {
        let rules = currentRules
        hasRecurrence = !rules.isEmpty || draft.recurrence == .series(rules: [])
        if let parsed = RecurrenceRuleLine.parsePattern(from: rules,
            timeZoneIdentifier: EffectiveTimeZone.identifier, isAllDay: draft.schedule.kind == .allDay) {
            pattern = parsed
        } else if hasRecurrence {
            pattern = .init(
                frequency: .weekly,
                interval: 1,
                byWeekday: [weekdayIndex(for: draft.schedule.start)]
            )
        }
    }

    private func toggleRecurrence(_ enabled: Bool) {
        hasRecurrence = enabled
        if enabled {
            if pattern.byWeekday.isEmpty, pattern.frequency == .weekly {
                pattern.byWeekday = [weekdayIndex(for: draft.schedule.start)]
            }
            syncDraftRecurrence()
        } else {
            model.updateDraftRecurrence(.single)
        }
    }

    private func syncDraftRecurrence() {
        guard hasRecurrence else { return }
        let isAllDay = draft.schedule.kind == .allDay
        guard
            let line = RecurrenceRuleLine.buildLine(
                pattern: pattern,
                timeZoneIdentifier: EffectiveTimeZone.identifier,
                isAllDay: isAllDay
            )
        else { return }
        model.updateDraftRecurrence(.series(rules: [line]))
    }

    private func weekdayIndex(for date: Date) -> Int {
        var calendar = EffectiveTimeZone.calendar
        calendar.firstWeekday = 1
        let weekday = calendar.component(.weekday, from: date)
        return (weekday + 5) % 7
    }
}
