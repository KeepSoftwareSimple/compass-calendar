import Foundation

struct ShortcutsDocument: Decodable, Sendable {
    struct RegistryRow: Decodable, Sendable {
        let id: String
        let keys: [String]
        let label: String
        let section: String
    }

    struct EditSequenceField: Decodable, Sendable {
        let key: String?
        let field: String
        let label: String
        let digit: String
    }

    struct LevelRow: Decodable, Sendable {
        let level: Int
        let name: String
        let minUsed: Int
    }

    let registry: [RegistryRow]
    let bindings: [String: [String]]
    let editSequenceLeader: String
    let editSequenceFields: [EditSequenceField]
    let shortcutLevels: [LevelRow]
}
