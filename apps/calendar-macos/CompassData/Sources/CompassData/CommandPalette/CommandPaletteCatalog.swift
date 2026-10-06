import CompassKit
import Foundation

/// Builds palette rows for navigation, events, and more actions.
public enum CommandPaletteCatalog {
    public static func sections(
        view: CalendarGridView,
        query: String,
        now: Date,
        isSignedIn: Bool,
        isTrialing: Bool,
        eventHits: [CommandPaletteEventHit],
        recentIds: [String]
    ) -> [CommandPaletteSection] {
        var built: [CommandPaletteSection] = []

        if let goToDate = goToDateItem(query: query, now: now) {
            built.append(CommandPaletteSection(id: "go-to-date", heading: "", items: [goToDate]))
        }

        let navigation = navigationItems(view: view)
        if !navigation.isEmpty {
            built.append(CommandPaletteSection(id: "navigation", heading: "Navigation", items: navigation))
        }

        if !eventHits.isEmpty {
            built.append(
                CommandPaletteSection(
                    id: "events",
                    heading: "Events",
                    items: eventHits.map { hit in
                        CommandPaletteItem(
                            id: "event-\(hit.eventId)",
                            sectionId: "events",
                            sectionHeading: "Events",
                            label: hit.label,
                            keywords: [hit.subtitle])
                    }))
        }

        let recent = recentItems(recentIds: recentIds, navigation: navigation)
        if !recent.isEmpty {
            built.append(CommandPaletteSection(id: "recent", heading: "Recent", items: recent))
        }

        built.append(contentsOf: eventActionSections())
        built.append(contentsOf: moreSections(isTrialing: isTrialing))

        if !isSignedIn {
            built.append(
                CommandPaletteSection(
                    id: "auth",
                    heading: "Account",
                    items: [
                        CommandPaletteItem(
                            id: "sign-up",
                            sectionId: "auth",
                            sectionHeading: "Account",
                            label: "Sign Up",
                            keywords: ["register", "create account"]),
                        CommandPaletteItem(
                            id: "log-in",
                            sectionId: "auth",
                            sectionHeading: "Account",
                            label: "Log In",
                            keywords: ["sign in"]),
                    ]))
        }

        return built
    }

    private static func goToDateItem(
        query: String,
        now: Date
    ) -> CommandPaletteItem? {
        guard let date = UserDateParsing.parseUserDate(query, now: now) else { return nil }
        return CommandPaletteItem(
            id: "go-to-date",
            sectionId: "go-to-date",
            sectionHeading: "",
            label: UserDateParsing.goToDatePaletteLabel(date),
            keywords: [query])
    }

    private static func navigationItems(
        view: CalendarGridView
    ) -> [CommandPaletteItem] {
        var items: [CommandPaletteItem] = [
            CommandPaletteItem(
                id: "today",
                sectionId: "navigation",
                sectionHeading: "Navigation",
                label: "Go to Today",
                shortcut: "t",
                keywords: ["now", "current", "jump"]),
        ]
        if view != .day {
            items.append(
                CommandPaletteItem(
                    id: "go-to-day",
                    sectionId: "navigation",
                    sectionHeading: "Navigation",
                    label: "Go to Day view",
                    shortcut: "d",
                    keywords: ["day view", "daily"]))
        }
        if view != .week {
            items.append(
                CommandPaletteItem(
                    id: "go-to-week",
                    sectionId: "navigation",
                    sectionHeading: "Navigation",
                    label: "Go to Week view",
                    shortcut: "w",
                    keywords: ["week view", "weekly"]))
        }
        if view != .life {
            items.append(
                CommandPaletteItem(
                    id: "go-to-life",
                    sectionId: "navigation",
                    sectionHeading: "Navigation",
                    label: "Go to Life view",
                    shortcut: "l",
                    keywords: ["life view", "years"]))
        }
        items.append(
            CommandPaletteItem(
                id: "show-shortcuts",
                sectionId: "navigation",
                sectionHeading: "Navigation",
                label: "Show shortcuts",
                shortcut: "?",
                keywords: ["keyboard", "legend", "help"]))
        return items
    }

    private static func recentItems(
        recentIds: [String],
        navigation: [CommandPaletteItem]
    ) -> [CommandPaletteItem] {
        let lookup = Dictionary(uniqueKeysWithValues: navigation.map { ($0.id, $0) })
        return recentIds.compactMap { lookup[$0] }
    }

    private static func eventActionSections() -> [CommandPaletteSection] {
        [
            CommandPaletteSection(
                id: "create",
                heading: "Create",
                items: [
                    CommandPaletteItem(
                        id: "create-event",
                        sectionId: "create",
                        sectionHeading: "Create",
                        label: "Create event",
                        shortcut: "c",
                        keywords: ["new event", "schedule"]),
                    CommandPaletteItem(
                        id: "create-allday-event",
                        sectionId: "create",
                        sectionHeading: "Create",
                        label: "Create all-day event",
                        shortcut: "shift+c",
                        keywords: ["all day"]),
                ]),
        ]
    }

    private static func moreSections(
        isTrialing: Bool
    ) -> [CommandPaletteSection] {
        var items: [CommandPaletteItem] = [
            CommandPaletteItem(
                id: "open-settings",
                sectionId: "advanced",
                sectionHeading: "More",
                label: "Settings",
                shortcut: ",",
                keywords: ["preferences", "account"]),
            CommandPaletteItem(
                id: "about",
                sectionId: "advanced",
                sectionHeading: "More",
                label: "About Compass",
                keywords: ["version", "info"]),
        ]
        if isTrialing {
            items.insert(
                CommandPaletteItem(
                    id: "subscribe",
                    sectionId: "advanced",
                    sectionHeading: "More",
                    label: "Subscribe now",
                    shortcut: "b",
                    keywords: ["billing", "upgrade"]),
                at: 0)
        }
        return [CommandPaletteSection(id: "advanced", heading: "More", items: items)]
    }
}

public struct CommandPaletteEventHit: Hashable, Sendable {
    public let eventId: String
    public let label: String
    public let subtitle: String

    public init(eventId: String, label: String, subtitle: String) {
        self.eventId = eventId
        self.label = label
        self.subtitle = subtitle
    }
}

