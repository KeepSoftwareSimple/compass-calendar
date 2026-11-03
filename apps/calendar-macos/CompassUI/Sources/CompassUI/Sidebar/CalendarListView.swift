import CompassData
import CompassKit
import SwiftUI

/// Web `CalendarList`: active calendars grouped by account, each row a color
/// dot (filled when shown) that toggles the calendar's visibility on click.
/// Account headings collapse their rows. A focused list (page jump or click)
/// shows number-key chips that toggle rows.
struct CalendarListView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let calendar = model.anonymousCalendar {
                AnonymousCalendarRowView(calendar: calendar) { model.authStore.openModal(.signUp) }
            }
            if showsConnectButtons {
                connectButtons
            }
            ForEach(model.calendarListGroups) { group in
                section(group)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Calendars")
    }

    /// Web `CalendarListHeader`: signed in with no connected account yet.
    private var showsConnectButtons: Bool {
        model.isSignedIn
            && model.syncConnectionsStore.connections.isEmpty
            && !model.connectCalendarProviderKinds.isEmpty
    }

    private var connectButtons: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(model.connectCalendarProviderKinds, id: \.self) { kind in
                Button {
                    Task { await model.connectCalendar(provider: kind) }
                } label: {
                    Text(connectLabel(kind))
                        .font(.rubik(12))
                        .foregroundStyle(theme.textColor)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(theme.accentSecondaryColor.opacity(0.25))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func connectLabel(_ kind: SignInProviderKind) -> String {
        switch kind {
        case .google: "Connect Google Calendar"
        case .microsoft: "Connect Microsoft Calendar"
        case .apple: "Connect iCloud Calendar"
        }
    }

    private func section(_ group: CalendarListGroup) -> some View {
        let collapsed = model.isAccountCollapsed(group.id)
        let focused = model.focusedCalendarListKey == group.id
        return VStack(alignment: .leading, spacing: 6) {
            if let account = group.account {
                Button {
                    model.toggleAccountCollapsed(group.id)
                } label: {
                    HStack(spacing: 6) {
                        Text(account)
                            .font(.rubik(14, weight: .semibold))
                            .foregroundStyle(theme.textMutedColor)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                            .font(.system(size: 10))
                            .foregroundStyle(theme.textMutedColor)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(account)
                .accessibilityValue(collapsed ? "Collapsed" : "Expanded")
                .accessibilityHint(collapsed ? "Show this account's calendars" : "Hide this account's calendars")
            }
            if !collapsed {
                ForEach(Array(group.calendars.enumerated()), id: \.element.id) { index, calendar in
                    row(
                        calendar,
                        pickKey: model.calendarPickKey(groupKey: group.id, index: index),
                        groupKey: group.id,
                        underAccountHeading: group.account != nil,
                    )
                }
            }
        }
        .padding(4)
        .overlay {
            if focused {
                RoundedRectangle(cornerRadius: 4)
                    .stroke(theme.accentColor, lineWidth: 2)
                    .allowsHitTesting(false)
            }
        }
        .pageJumpChipAnchor(id: PageJumpTargets.calendarAccountJumpId(accountKey: group.id))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(group.account.map { "Calendars for \($0)" } ?? "Calendars")
    }

    private func row(
        _ calendar: CompassCalendar,
        pickKey: Character?,
        groupKey: String,
        underAccountHeading: Bool,
    ) -> some View {
        let rowTitle = CalendarSidebarDisplayName.rowTitle(
            for: calendar,
            underAccountHeading: underAccountHeading,
        )
        let isVisible = model.calendarVisibilityStore.isVisible(calendar.id)
        let color = EventCardColorParser.nsColor(hex: calendar.backgroundColor).map(Color.init(nsColor:))
            ?? theme.accentColor
        return Button {
            model.focusCalendarList(groupKey)
            model.toggleCalendarVisibility(calendar)
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(isVisible ? color : .clear)
                    .overlay(Circle().stroke(color, lineWidth: 2))
                    .frame(width: 14, height: 14)
                Text(rowTitle)
                    .font(.rubik(12))
                    .foregroundStyle(theme.textMutedColor)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let pickKey {
                    Text(String(pickKey))
                        .font(.rubik(11, weight: .medium))
                        .foregroundStyle(theme.textColor)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(theme.surfaceColor)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(rowTitle)
        .accessibilityValue(isVisible ? "Shown" : "Hidden")
        .accessibilityHint(isVisible ? "Hide this calendar" : "Show this calendar")
    }
}
