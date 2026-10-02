import Foundation
import Security

public struct KeychainSessionStore: SessionStore {
    public static let defaultService = "com.compasscalendar.desktop.session"

    private let service: String
    private let account: String

    public init(service: String = KeychainSessionStore.defaultService, account: String = "default") {
        self.service = service
        self.account = account
    }

    public func load() throws -> SessionTokens? {
        var query: [String: Any] = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw KeychainSessionStoreError.unexpectedStatus(status)
        }
        return try JSONDecoder().decode(SessionTokens.self, from: data)
    }

    public func save(_ tokens: SessionTokens) throws {
        let data = try JSONEncoder().encode(tokens)
        var query = baseQuery()
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        if updateStatus == errSecItemNotFound {
            query.merge(attributes) { _, new in new }
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainSessionStoreError.unexpectedStatus(addStatus)
            }
            return
        }
        throw KeychainSessionStoreError.unexpectedStatus(updateStatus)
    }

    public func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return
        }
        throw KeychainSessionStoreError.unexpectedStatus(status)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

public enum KeychainSessionStoreError: Error, Equatable {
    case unexpectedStatus(OSStatus)
}
