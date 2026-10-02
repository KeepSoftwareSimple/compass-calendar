import Foundation

enum ContractTestFixtures {
    static func url(named name: String) -> URL? {
        #if SWIFT_PACKAGE
        return Bundle.module.url(
            forResource: name,
            withExtension: "json",
            subdirectory: "Fixtures"
        )
        #else
        return Bundle(for: BundleLocator.self).url(
            forResource: name,
            withExtension: "json",
            subdirectory: "Fixtures"
        )
        #endif
    }

    private final class BundleLocator: NSObject {}
}
