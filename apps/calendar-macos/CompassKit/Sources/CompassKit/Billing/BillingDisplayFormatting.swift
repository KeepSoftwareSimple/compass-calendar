import Foundation

/// Mirrors `billing-display.ts` (subset used by native plan section).
public enum BillingDisplayFormatting {
    private static let invoiceStatusLabels: [String: String] = [
        "paid": "Paid",
        "open": "Open",
        "void": "Void",
        "uncollectible": "Uncollectible",
    ]

    public static func formatMoney(amountMinor: Double, currency: String) -> String {
        let amount = amountMinor / 100
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency.uppercased()
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    public static func formatPriceLine(
        amountMinor: Double,
        currency: String,
        interval: String
    ) -> String {
        "\(formatMoney(amountMinor: amountMinor, currency: currency)) per \(interval)"
    }

    public static func formatBillingDate(iso: String) -> String {
        guard let date = BillingISO8601.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US")
        out.dateFormat = "MMM d, yyyy"
        return out.string(from: date)
    }

    public static func formatCardOnFile(
        brand: String,
        last4: String,
        expMonth: Int,
        expYear: Int
    ) -> String {
        let brandLabel = brand.prefix(1).uppercased() + brand.dropFirst()
        let month = String(format: "%02d", expMonth)
        let year = String(expYear).suffix(2)
        return "\(brandLabel) ending in \(last4), expires \(month)/\(year)"
    }

    public static func formatInvoiceStatus(_ status: String) -> String {
        if let mapped = invoiceStatusLabels[status] { return mapped }
        guard let first = status.first else { return status }
        return first.uppercased() + status.dropFirst()
    }
}

enum BillingISO8601 {
    static func date(from iso: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso)
    }
}
