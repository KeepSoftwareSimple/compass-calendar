import Foundation

public struct TimezonePickerResult: Equatable, Sendable {
    public let iana: String
    public let title: String
    public let subtitle: String
    public let listKey: String

    public init(iana: String, title: String, subtitle: String, listKey: String) {
        self.iana = iana
        self.title = title
        self.subtitle = subtitle
        self.listKey = listKey
    }
}

private struct CityTimezoneIndexRow: Decodable {
    let city: String
    let province: String
    let iso2: String
    let iana: String
    let pop: Double
}

/// Web `@core/timezone/city-timezone-search`: city-timezones index in `city-timezone-index.json`.
public enum CityTimezoneSearch {
    private static var cachedRows: [CityTimezoneIndexRow]?

    private static func rows() -> [CityTimezoneIndexRow] {
        if let cachedRows { return cachedRows }
        guard let url = Bundle.module.url(forResource: "city-timezone-index", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode([CityTimezoneIndexRow].self, from: data)
        else {
            cachedRows = []
            return []
        }
        cachedRows = decoded
        return decoded
    }

    public static func normalizeQuery(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .lowercased()
    }

    public static func search(
        query: String,
        at date: Date = Date(),
        limit: Int = 40
    ) -> [TimezonePickerResult] {
        let normalized = normalizeQuery(query)
        guard normalized.count >= 2 else { return [] }

        var matches = rows().filter { row in
            let city = row.city.lowercased()
            let province = row.province.lowercased()
            return city == normalized
                || city.hasPrefix(normalized)
                || province == normalized
                || city.contains(normalized)
                || province.contains(normalized)
        }

        let usProvinceHits = matches.filter {
            $0.iso2 == "US" && $0.province.lowercased() == normalized
        }
        if usProvinceHits.count >= 3 {
            matches = usProvinceHits
        }

        matches.sort { left, right in
            func score(_ row: CityTimezoneIndexRow) -> Double {
                let city = row.city.lowercased()
                let province = row.province.lowercased()
                if city == normalized { return 1 }
                if city.hasPrefix(normalized) { return 0.9 }
                if province == normalized { return 0.75 }
                if city.contains(normalized) { return 0.6 }
                return 0.5
            }
            let leftScore = score(left)
            let rightScore = score(right)
            if leftScore != rightScore { return leftScore > rightScore }
            return left.pop > right.pop
        }

        let zones = Set(matches.map(\.iana))
        let regionNote = (normalized == "florida" && zones.count > 1)
            ? "Florida spans multiple time zones"
            : nil

        var seen = Set<String>()
        var results: [TimezonePickerResult] = []

        for row in matches {
            let listKey = "\(row.iana):\(row.city):\(row.iso2)"
            guard !seen.contains(listKey) else { continue }
            seen.insert(listKey)

            let country = row.iso2 == "US" ? "US" : row.iso2
            let title = [row.city, row.province, country].filter { !$0.isEmpty }.joined(separator: ", ")
            var subtitleParts = [
                TimeZoneFormatting.abbreviation(for: row.iana, at: date),
                row.iana,
            ]
            if let regionNote { subtitleParts.insert(regionNote, at: 0) }
            results.append(TimezonePickerResult(
                iana: row.iana,
                title: title,
                subtitle: subtitleParts.joined(separator: " · "),
                listKey: listKey))
            if results.count >= limit { break }
        }

        return results
    }

    public static func filterZones(
        query: String,
        zones: [String],
        at date: Date = Date(),
        limit: Int = 40
    ) -> [TimezonePickerResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return zones.prefix(limit).map { iana in
                TimezonePickerResult(
                    iana: iana,
                    title: "\(TimeZoneFormatting.cityName(for: iana)) (\(TimeZoneFormatting.abbreviation(for: iana, at: date)))",
                    subtitle: iana,
                    listKey: iana)
            }
        }

        let placeHits = search(query: query, at: at, limit: limit)
        var seen = Set(placeHits.map(\.listKey))
        var merged = placeHits

        for iana in zones where iana.localizedCaseInsensitiveContains(trimmed) {
            guard !seen.contains(iana) else { continue }
            seen.insert(iana)
            merged.append(TimezonePickerResult(
                iana: iana,
                title: "\(TimeZoneFormatting.cityName(for: iana)) (\(TimeZoneFormatting.abbreviation(for: iana, at: date)))",
                subtitle: iana,
                listKey: iana))
            if merged.count >= limit { break }
        }

        return merged
    }
}
