import XCTest
@testable import CompassKit

final class ProductEventNativeCoverageTests: XCTestCase {
    func testNativeAndWebOnlyPartitionProductEvents() {
        ProductEventNativeCoverage.validatePartition()
        let union = ProductEventNativeCoverage.nativeCallSites.union(
            ProductEventNativeCoverage.webOnly)
        XCTAssertEqual(union.count, ProductEvent.allCases.count)
    }
}
