import CompassData
import CompassKit
import SwiftUI

struct EventFormCalendarSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @State private var isHovered = false
    @FocusState private var calendarFocused: Bool
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft

    var body: some View {
        // Web `CalendarSelect`: a compact, borderless trigger (`px-1.5 py-1
        // text-xs`, hover `bg-text/10`) inside the card; no visible label.
        // An existing event names its calendar instead of offering a move.
        Group {
            if draft.kind != .create {
                Text("Calendar: \(selectedCalendar?.name ?? originalCalendarName)")
                    .font(.rubik(12))
                    .foregroundStyle(theme.textMutedColor)
                    .accessibilityIdentifier("compass-event-form-calendar")
            } else {
                calendarMenu
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var calendarMenu: some View {
        Menu {
            ForEach(model.writableEventCalendars, id: \.id) { calendar in
                Button(calendarLabel(calendar)) {
                    model.updateDraftFromForm(calendarId: CalendarId(rawValue: calendar.id))
                }
            }
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(selectedCalendar.map(calendarDotColor) ?? .clear)
                    .frame(width: 10, height: 10)
                Text(selectedCalendar.map(calendarLabel) ?? "Select a calendar")
                    .font(.rubik(12))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(isHovered ? theme.textColor.opacity(0.1) : .clear)
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .overlay {
                if calendarFocused {
                    RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                        .stroke(theme.accentColor, lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .focusEffectDisabled()
        .focused($calendarFocused)
        .onChange(of: model.eventFormCalendarFocusRequest) { _, _ in
            DispatchQueue.main.async {
                guard model.isEventFormVisible, model.eventFormFocusedField == .calendar else { return }
                calendarFocused = true
            }
        }
        .onHover { isHovered = $0 }
        .disabled(!model.canChangeDraftCalendar)
        .accessibilityIdentifier("compass-event-form-calendar")
        .pageJumpChipAnchor(id: "form-calendar")
    }

    private var originalCalendarName: String {
        guard let id = draft.calendarId else { return "Unknown" }
        return model.calendars.first { $0.id == id.rawValue }?.name ?? "Unknown"
    }

    private var selectedCalendar: CompassCalendar? {
        guard let id = draft.calendarId else { return nil }
        return model.writableEventCalendars.first { $0.id == id.rawValue }
    }

    private func calendarLabel(_ calendar: CompassCalendar) -> String {
        calendar.isPrimary ? "\(calendar.name) (primary)" : calendar.name
    }

    private func calendarDotColor(_ calendar: CompassCalendar) -> Color {
        EventCardColorParser.nsColor(hex: calendar.backgroundColor).map(Color.init(nsColor:))
            ?? theme.textMutedColor
    }
}
