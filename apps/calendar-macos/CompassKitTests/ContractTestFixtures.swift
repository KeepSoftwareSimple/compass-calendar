import Foundation

enum ContractTestFixtures {
    static func url(named name: String) -> URL? {
        let bundle: Bundle = {
            #if SWIFT_PACKAGE
            return Bundle.module
            #else
            return Bundle(for: BundleLocator.self)
            #endif
        }()
        for subdirectory in ["Fixtures", "Resources/Fixtures", ""] {
            if let url = bundle.url(
                forResource: name,
                withExtension: "json",
                subdirectory: subdirectory.isEmpty ? nil : subdirectory
            ) {
                return url
            }
        }
        return nil
    }

    private final class BundleLocator: NSObject {}
}
