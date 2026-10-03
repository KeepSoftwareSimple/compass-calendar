import Foundation

public enum LifeDotState: String, Codable, Sendable, Hashable {
    case future
    case lived
    case current
}

public struct LifeGridSnapshot: Codable, Sendable, Hashable {
    public let totalDots: Int
    public let weeksLived: Int
    public let rowCount: Int
    public let dots: [LifeDotState]

    public init(totalDots: Int, weeksLived: Int, rowCount: Int, dots: [LifeDotState]) {
        self.totalDots = totalDots
        self.weeksLived = weeksLived
        self.rowCount = rowCount
        self.dots = dots
    }
}

public enum LifeGridSnapshotBuilder {
    public static func build(
        birthDate: String,
        lifespan: Int,
        today: Date,
        showCurrentWeek: Bool
    ) -> LifeGridSnapshot {
        let totalDots = LifeMath.totalLifeDots(lifespan: lifespan)
        let weeksLived = LifeMath.weekLivedCount(
            birthDateValue: birthDate,
            totalDots: totalDots,
            today: today)
        let hasBirthDate = LifeMath.parseLifeDate(birthDate) != nil
        let highlightCurrent = showCurrentWeek && hasBirthDate
        var dots: [LifeDotState] = []
        dots.reserveCapacity(totalDots)
        for index in 0 ..< totalDots {
            if highlightCurrent, index == weeksLived {
                dots.append(.current)
            } else if index < weeksLived {
                dots.append(.lived)
            } else {
                dots.append(.future)
            }
        }
        let rowCount = Int(ceil(Double(totalDots) / Double(LifeMath.weeksPerRow)))
        return LifeGridSnapshot(
            totalDots: totalDots,
            weeksLived: weeksLived,
            rowCount: rowCount,
            dots: dots)
    }
}
