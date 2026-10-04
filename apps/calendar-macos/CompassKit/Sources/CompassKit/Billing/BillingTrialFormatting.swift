import Foundation

/// Mirrors `trialDaysLeft.ts`.
public enum BillingTrialFormatting {
    public static func daysLeft(
        trialEndsAt: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> Int {
        guard let end = BillingISO8601.date(from: trialEndsAt) else { return 0 }
        let seconds = end.timeIntervalSince(now)
        let days = ceil(seconds / 86_400)
        return max(0, Int(days))
    }

    public static func badgeLabel(daysLeft: Int) -> String {
        daysLeft <= 0 ? "Last day" : "\(daysLeft)d"
    }

    public static func badgeDescription(daysLeft: Int) -> String {
        if daysLeft <= 0 { return "Last day of your trial" }
        if daysLeft == 1 { return "1 day left in your trial" }
        return "\(daysLeft) days left in your trial"
    }
}
