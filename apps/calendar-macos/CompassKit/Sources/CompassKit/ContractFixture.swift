import Foundation

public enum ContractFixture {
    public static func url(named name: String) -> URL? {
        Bundle.module.url(
            forResource: name,
            withExtension: "json",
            subdirectory: "Fixtures"
        )
    }
}
