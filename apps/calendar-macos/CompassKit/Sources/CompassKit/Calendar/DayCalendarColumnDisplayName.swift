import Foundation

/// Parity with `dayCalendarColumnDisplayName.util.ts`.
public enum DayCalendarColumnDisplayName {
    private struct EmailParts {
        let local: String
        let domain: String
    }

    private static func parseEmail(_ name: String) -> EmailParts? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = trimmed.lastIndex(of: "@"), at > trimmed.startIndex else {
            return nil
        }
        let domainStart = trimmed.index(after: at)
        guard domainStart < trimmed.endIndex, !trimmed.contains(" ") else {
            return nil
        }
        return EmailParts(
            local: String(trimmed[..<at]),
            domain: String(trimmed[domainStart...])
        )
    }

    public static func emailDomainStem(_ domain: String) -> String {
        let parts = domain
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(separator: ".")
            .map(String.init)
        guard parts.count >= 2, let tld = parts.last, tld.count <= 3 else {
            return parts.first ?? domain
        }
        return parts[parts.count - 2]
    }

    public static func defaultDisplayName(_ name: String) -> String {
        guard let email = parseEmail(name) else {
            return name.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return email.local
    }

    public static func displayNames(for names: [String]) -> [String] {
        let emails = names.map { parseEmail($0) }
        var labels = names.map { defaultDisplayName($0) }

        var duplicates = duplicateKeys(in: labels)
        if duplicates.isEmpty {
            return labels
        }

        labels = labels.enumerated().map { index, label in
            guard duplicates.contains(label), let email = emails[index] else {
                return label
            }
            return emailDomainStem(email.domain)
        }

        duplicates = duplicateKeys(in: labels)
        if duplicates.isEmpty {
            return labels
        }

        return labels.enumerated().map { index, label in
            guard duplicates.contains(label), let email = emails[index] else {
                return label
            }
            let domainParts = email.domain
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .split(separator: ".")
                .map(String.init)
            let domainHint = domainParts.count >= 3
                ? domainParts[0]
                : emailDomainStem(email.domain)
            return "\(email.local)@\(domainHint)"
        }
    }

    public static func format(_ name: String) -> String {
        displayNames(for: [name]).first ?? name
    }

    private static func duplicateKeys(in labels: [String]) -> Set<String> {
        var counts: [String: Int] = [:]
        for label in labels {
            counts[label, default: 0] += 1
        }
        return Set(counts.filter { $0.value > 1 }.map(\.key))
    }
}
