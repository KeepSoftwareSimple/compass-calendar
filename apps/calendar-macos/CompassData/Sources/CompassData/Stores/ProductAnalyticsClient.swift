import CompassKit
import Foundation

public protocol ProductAnalyticsClient: Sendable {
    func track(_ event: ProductEvent, properties: ProductEventProperties)
}

public struct NoOpProductAnalyticsClient: ProductAnalyticsClient {
    public init() {}

    public func track(_ event: ProductEvent, properties: ProductEventProperties) {}
}
