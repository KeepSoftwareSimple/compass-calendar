import Foundation

/// Mirrors `apps/calendar-web/src/auth/compass/schemas/auth.schemas.ts`.
public enum AuthFormValidation {
    public static func normalizedEmail(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    public static func trimmedName(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public static func validateEmail(_ raw: String) -> String? {
        let email = normalizedEmail(raw)
        if email.isEmpty {
            return "Email is required"
        }
        if !email.contains("@") || email.split(separator: "@").count != 2 {
            return "Please enter a valid email address"
        }
        let domain = email.split(separator: "@")[1]
        if domain.isEmpty || !domain.contains(".") {
            return "Please enter a valid email address"
        }
        return nil
    }

    public static func validatePassword(_ raw: String, minimumLength: Int = 8) -> String? {
        if raw.isEmpty {
            return "Password is required"
        }
        if raw.count < minimumLength {
            return "Password must be at least 8 characters"
        }
        return nil
    }

    public static func validateSignInPassword(_ raw: String) -> String? {
        raw.isEmpty ? "Password is required" : nil
    }

    public static func validateName(_ raw: String) -> String? {
        trimmedName(raw).isEmpty ? "Name is required" : nil
    }

    public static func signUpIsValid(name: String, email: String, password: String) -> Bool {
        validateName(name) == nil && validateEmail(email) == nil && validatePassword(password) == nil
    }

    public static func logInIsValid(email: String, password: String) -> Bool {
        validateEmail(email) == nil && validateSignInPassword(password) == nil
    }

    public static func forgotPasswordIsValid(email: String) -> Bool {
        validateEmail(email) == nil
    }

    public static func resetPasswordIsValid(password: String) -> Bool {
        validatePassword(password) == nil
    }
}
