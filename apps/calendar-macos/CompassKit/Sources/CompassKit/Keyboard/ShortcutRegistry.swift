import Foundation

public struct ShortcutRegistryEntry: Hashable, Sendable {
    public let id: ShortcutId
    public let label: String
    public let section: String
    public let displayKeycaps: [String]
    public let bindingChords: [KeyChord]
    public let when: ShortcutContextWhen?
}

public enum ShortcutRegistryLoadError: Error, Sendable {
    case missingResource
    case decodeFailed
    case unknownShortcutId(String)
}

/// Loads `shortcuts.json` and exposes registry rows with parsed chords.
public struct ShortcutRegistry: Sendable {
    public let entries: [ShortcutRegistryEntry]
    public let bindingsById: [ShortcutId: [KeyChord]]
    public let editSequenceLeader: Character
    public let editSequenceFields: [EditSequenceFieldRow]
    public let levelDefinitions: [ShortcutLevelDefinition]

    public struct EditSequenceFieldRow: Hashable, Sendable {
        public let secondKey: Character?
        public let field: String
        public let label: String
        public let digit: String
    }

    public init(bundle: Bundle = CompassKitResourceBundle.resources) throws {
        guard let url = bundle.url(
            forResource: "shortcuts",
            withExtension: "json",
            subdirectory: "Resources"
        ) else {
            throw ShortcutRegistryLoadError.missingResource
        }
        let data = try Data(contentsOf: url)
        let document: ShortcutsDocument
        do {
            document = try JSONDecoder().decode(ShortcutsDocument.self, from: data)
        } catch {
            throw ShortcutRegistryLoadError.decodeFailed
        }

        var entries: [ShortcutRegistryEntry] = []
        var bindingsById: [ShortcutId: [KeyChord]] = [:]

        for row in document.registry {
            guard let id = ShortcutId(rawValue: row.id) else {
                throw ShortcutRegistryLoadError.unknownShortcutId(row.id)
            }
            let bindingKeycaps = document.bindings[row.id] ?? row.keys
            let chords = try Self.chords(from: bindingKeycaps)
            bindingsById[id] = chords
            entries.append(
                ShortcutRegistryEntry(
                    id: id,
                    label: row.label,
                    section: row.section,
                    displayKeycaps: row.keys,
                    bindingChords: chords,
                    when: row.when))
        }

        self.entries = entries
        self.bindingsById = bindingsById

        guard let leaderScalar = document.editSequenceLeader.unicodeScalars.first else {
            throw ShortcutRegistryLoadError.decodeFailed
        }
        editSequenceLeader = Character(leaderScalar)
        editSequenceFields = document.editSequenceFields.map { field in
            EditSequenceFieldRow(
                secondKey: field.key.flatMap { $0.unicodeScalars.first.map(Character.init) },
                field: field.field,
                label: field.label,
                digit: field.digit)
        }
        levelDefinitions = document.shortcutLevels.map {
            ShortcutLevelDefinition(level: $0.level, name: $0.name, minUsed: $0.minUsed)
        }
    }

    public var registryIds: Set<ShortcutId> {
        Set(entries.map(\.id))
    }

    private static func chords(from keycaps: [String]) throws -> [KeyChord] {
        try KeyChordParser.parseKeycapAlternatives(keycaps)
    }
}
