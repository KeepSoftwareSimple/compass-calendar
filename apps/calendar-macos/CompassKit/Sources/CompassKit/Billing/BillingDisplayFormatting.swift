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
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: iso)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: iso)
        }
        guard let date else { return iso }
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
