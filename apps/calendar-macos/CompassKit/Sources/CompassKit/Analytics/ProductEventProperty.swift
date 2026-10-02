import Foundation

public enum ProductEventPropertyValue: Hashable, Sendable {
    case string(String)
    case int(Int)
    case bool(Bool)
}

public typealias ProductEventProperties = [String: ProductEventPropertyValue]

extension ProductEventProperties {
    public func posthogJSON() -> [String: Any] {
        var encoded: [String: Any] = [:]
        for (key, value) in self {
            switch value {
            case .string(let string):
                encoded[key] = string
            case .int(let number):
                encoded[key] = number
            case .bool(let flag):
                encoded[key] = flag
            }
        }
        return encoded
    }
}
