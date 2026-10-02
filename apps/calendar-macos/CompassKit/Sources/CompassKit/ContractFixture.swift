import Foundation

public enum ContractFixture {
    public static func url(named name: String) -> URL? {
        for subdirectory in ["Fixtures", "Resources/Fixtures"] {
            if let url = Bundle.module.url(
                forResource: name,
                withExtension: "json",
                subdirectory: subdirectory
            ) {
                return url
            }
        }
        if let resourceRoot = Bundle.module.resourceURL {
            let direct = resourceRoot
                .appendingPathComponent("Fixtures")
                .appendingPathComponent("\(name).json")
            if FileManager.default.fileExists(atPath: direct.path) {
                return direct
            }
        }
        return nil
    }
}
