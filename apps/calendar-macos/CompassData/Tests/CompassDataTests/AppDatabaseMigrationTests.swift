import CompassData
import GRDB
import XCTest

final class AppDatabaseMigrationTests: XCTestCase {
    func testV1CreatesExpectedTables() throws {
        let database = try AppDatabase.inMemory()
        try database.writer.read { db in
            XCTAssertTrue(try db.tableExists("event"))
            XCTAssertTrue(try db.tableExists("calendar"))
            XCTAssertTrue(try db.tableExists("hidden_event"))
            XCTAssertTrue(try db.tableExists("loaded_range"))
            XCTAssertTrue(try db.tableExists("user_metadata"))
            XCTAssertTrue(try db.tableExists("event_fts"))
            XCTAssertTrue(try db.tableExists("local_event"))
        }
    }
}
