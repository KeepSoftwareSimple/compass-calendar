import CompassKit
import XCTest

final class AuthFormValidationTests: XCTestCase {
    func testEmailValidationMatchesWebCopy() {
        XCTAssertEqual(AuthFormValidation.validateEmail(""), "Email is required")
        XCTAssertEqual(
            AuthFormValidation.validateEmail("not-an-email"),
            "Please enter a valid email address")
        XCTAssertNil(AuthFormValidation.validateEmail("  Test@Example.com  "))
        XCTAssertEqual(AuthFormValidation.normalizedEmail("  Test@Example.com  "), "test@example.com")
    }

    func testPasswordValidationMatchesWebCopy() {
        XCTAssertEqual(AuthFormValidation.validatePassword(""), "Password is required")
        XCTAssertEqual(
            AuthFormValidation.validatePassword("short"),
            "Password must be at least 8 characters")
        XCTAssertNil(AuthFormValidation.validatePassword("long-enough"))
    }

    func testNameValidationRejectsWhitespaceOnly() {
        XCTAssertEqual(AuthFormValidation.validateName("   "), "Name is required")
        XCTAssertNil(AuthFormValidation.validateName(" Ada "))
    }

    func testAggregateValidity() {
        XCTAssertTrue(AuthFormValidation.logInIsValid(email: "a@b.com", password: "secret"))
        XCTAssertFalse(AuthFormValidation.logInIsValid(email: "", password: ""))
        XCTAssertTrue(
            AuthFormValidation.signUpIsValid(name: "Ada", email: "a@b.com", password: "12345678"))
    }
}
