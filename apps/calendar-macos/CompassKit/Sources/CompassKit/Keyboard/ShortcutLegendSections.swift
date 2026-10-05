import Foundation

public struct ShortcutLegendRow: Hashable, Sendable {
    public let id: ShortcutId
    public let label: String
    public let section: String
    public let keycaps: [String]

    public init(id: ShortcutId, label: String, section: String, keycaps: [String]) {
        self.id = id
        self.label = label
        self.section = section
        self.keycaps = keycaps
    }
}

public struct ShortcutLegendSection: Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let rows: [ShortcutLegendRow]

    public init(id: String, title: String, rows: [ShortcutLegendRow]) {
        self.id = id
        self.title = title
        self.rows = rows
    }
}

/// Builds legend and catalog sections from `shortcuts.json` with web-parity filtering.
public enum ShortcutLegendSections {
    private static let sectionTitles: [(id: String, title: String)] = [
        ("navigate", "Navigate"),
        ("create", "Create"),
        ("focus", "Focus"),
        ("edit", "Edit"),
        ("other", "Other"),
    ]

    public static func menuSections(
        registry: ShortcutRegistry,
        options: ShortcutMenuFilter.Options
    ) -> [ShortcutLegendSection] {
        let rows = filteredRows(registry: registry, options: options)
        return groupBySection(rows)
    }

    /// Printable catalog: week legend, then form-open, day-only, life-only rows.
    public static func publicCatalogSections(registry: ShortcutRegistry) -> [ShortcutLegendSection] {
        let weekOptions = ShortcutMenuFilter.Options(
            view: .week,
            isViewingCurrentPeriod: false,
            isFormOpen: false,
            isTrialing: false)
        var week = menuSections(registry: registry, options: weekOptions)
        let weekIds = Set(week.flatMap(\.rows).map(\.id))

        let formOpen = filteredRows(
            registry: registry,
            options: ShortcutMenuFilter.Options(
                view: .week,
                isViewingCurrentPeriod: false,
                isFormOpen: true,
                isTrialing: false))
            .filter { !weekIds.contains($0.id) }

        let dayOnly = filteredRows(
            registry: registry,
            options: ShortcutMenuFilter.Options(view: .day, isViewingCurrentPeriod: false))
            .filter { !weekIds.contains($0.id) }
        let dayIds = Set(dayOnly.map(\.id))

        let lifeOnly = filteredRows(
            registry: registry,
            options: ShortcutMenuFilter.Options(view: .life, isViewingCurrentPeriod: false))
            .filter { !weekIds.contains($0.id) && !dayIds.contains($0.id) }

        if !formOpen.isEmpty {
            week.append(ShortcutLegendSection(id: "form-open", title: "While a form is open", rows: formOpen))
        }
        if !dayOnly.isEmpty {
            week.append(ShortcutLegendSection(id: "day-only", title: "Day view only", rows: dayOnly))
        }
        if !lifeOnly.isEmpty {
            week.append(ShortcutLegendSection(id: "life-only", title: "Life view only", rows: lifeOnly))
        }
        return week
    }

    private static func filteredRows(
        registry: ShortcutRegistry,
        options: ShortcutMenuFilter.Options
    ) -> [ShortcutLegendRow] {
        registry.entries.compactMap { entry in
            guard ShortcutMenuFilter.isVisible(entry: entry, options: options) else { return nil }
            return ShortcutLegendRow(
                id: entry.id,
                label: label(for: entry, options: options),
                section: entry.section,
                keycaps: entry.displayKeycaps)
        }
    }

    private static func groupBySection(_ rows: [ShortcutLegendRow]) -> [ShortcutLegendSection] {
        sectionTitles.compactMap { section in
            let sectionRows = rows.filter { $0.section == section.id }
            guard !sectionRows.isEmpty else { return nil }
            return ShortcutLegendSection(id: section.id, title: section.title, rows: sectionRows)
        }
    }

    private static func label(
        for entry: ShortcutRegistryEntry,
        options: ShortcutMenuFilter.Options
    ) -> String {
        switch entry.id {
        case .navPrevious:
            return "Previous \(options.view.rawValue)"
        case .navNext:
            return "Next \(options.view.rawValue)"
        case .navPickerStep:
            return options.view == .day
                ? "Move the month picker by a day (Enter opens it)"
                : "Move the month picker by a week (Enter opens it)"
        case .navToday:
            if options.isViewingCurrentPeriod { return "Scroll to now" }
            return options.view == .week ? "Go to current week" : "Go to today"
        case .editFocusPrev:
            return options.view == .week ? "Focus previous event on day" : "Focus previous event"
        case .editFocusNext:
            return options.view == .week ? "Focus next event on day" : "Focus next event"
        case .editFocusLeft:
            return options.view == .day ? "Focus previous event" : "Focus event on previous day"
        case .editFocusRight:
            return options.view == .day ? "Focus next event" : "Focus event on next day"
        default:
            return entry.label
        }
    }
}
