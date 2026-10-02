import Foundation

enum ContractTestDecoding {
    static func decodeJSON<T: Decodable>(_ json: String, as type: T.Type = T.self) throws -> T {
        let data = Data(json.utf8)
        return try JSONDecoder().decode(type, from: data)
    }
}
