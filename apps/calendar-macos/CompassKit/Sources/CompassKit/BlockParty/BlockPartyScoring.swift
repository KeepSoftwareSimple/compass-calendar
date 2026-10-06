import Foundation

public enum BlockPartyScoring {
    public static let runDurationMs = 120_000
    public static let taskBasePoints = 100
    public static let speedBonusMs = 8_000
    public static let speedBonusPoints = 50
    public static let timeBonusPerSecond = 10

    private static let streakX2At = 3
    private static let streakX3At = 6

    public static func streakMultiplier(streak: Int) -> Int {
        if streak >= streakX3At { return 3 }
        if streak >= streakX2At { return 2 }
        return 1
    }

    public static func scorePlacement(priorStreak: Int, elapsedMs: Int) -> (speedy: Bool, streak: Int, points: Int) {
        let speedy = elapsedMs <= speedBonusMs
        let streak = speedy ? priorStreak + 1 : 0
        let points = (taskBasePoints + (speedy ? speedBonusPoints : 0)) * streakMultiplier(streak: streak)
        return (speedy, streak, points)
    }
}
