import {
  EmailSchema,
  ForgotPasswordSchema,
  LogInSchema,
  NameSchema,
  PasswordSchema,
  SignUpSchema,
} from "./auth.schemas";

describe("auth.schemas", () => {
  describe("emailSchema", () => {
    it("validates a correct email", () => {
      const result = EmailSchema.safeParse("test@example.com");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test@example.com");
      }
    });

    it("transforms email to lowercase", () => {
      const result = EmailSchema.safeParse("Test@EXAMPLE.com");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test@example.com");
      }
    });

    it("trims whitespace", () => {
      const result = EmailSchema.safeParse("  test@example.com  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test@example.com");
      }
    });

    it("rejects empty string", () => {
      const result = EmailSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Email is required");
      }
    });

    it("rejects invalid email format", () => {
      const result = EmailSchema.safeParse("not-an-email");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Please enter a valid email address",
        );
      }
    });

    it("rejects email without domain", () => {
      const result = EmailSchema.safeParse("test@");
      expect(result.success).toBe(false);
    });
  });

  describe("passwordSchema", () => {
    it("validates password with 8+ characters", () => {
      const result = PasswordSchema.safeParse("password123");
      expect(result.success).toBe(true);
    });

    it("validates password with exactly 8 characters", () => {
      const result = PasswordSchema.safeParse("12345678");
      expect(result.success).toBe(true);
    });

    it("rejects empty password", () => {
      const result = PasswordSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Password is required");
      }
    });

    it("rejects password shorter than 8 characters", () => {
      const result = PasswordSchema.safeParse("1234567");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Password must be at least 8 characters",
        );
      }
    });
  });

  describe("nameSchema", () => {
    it("validates a non-empty name", () => {
      const result = NameSchema.safeParse("John Doe");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("John Doe");
      }
    });

    it("trims whitespace", () => {
      const result = NameSchema.safeParse("  John Doe  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("John Doe");
      }
    });

    it("rejects empty string", () => {
      const result = NameSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Name is required");
      }
    });

    it("rejects whitespace-only string", () => {
      const result = NameSchema.safeParse("   ");
      expect(result.success).toBe(false);
    });
  });

  describe("signUpSchema", () => {
    it("validates complete sign up data", () => {
      const result = SignUpSchema.safeParse({
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          name: "John Doe",
          email: "john@example.com",
          password: "password123",
        });
      }
    });

    it("transforms email and trims name", () => {
      const result = SignUpSchema.safeParse({
        name: "  John Doe  ",
        email: "JOHN@EXAMPLE.COM",
        password: "password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("John Doe");
        expect(result.data.email).toBe("john@example.com");
      }
    });

    it("rejects missing name", () => {
      const result = SignUpSchema.safeParse({
        email: "john@example.com",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = SignUpSchema.safeParse({
        name: "John",
        email: "invalid",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects short password", () => {
      const result = SignUpSchema.safeParse({
        name: "John",
        email: "john@example.com",
        password: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("signInSchema", () => {
    it("validates complete sign in data", () => {
      const result = LogInSchema.safeParse({
        email: "john@example.com",
        password: "anypassword",
      });
      expect(result.success).toBe(true);
    });

    it("accepts any non-empty password (no min length)", () => {
      const result = LogInSchema.safeParse({
        email: "john@example.com",
        password: "a",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty password", () => {
      const result = LogInSchema.safeParse({
        email: "john@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("transforms email to lowercase", () => {
      const result = LogInSchema.safeParse({
        email: "JOHN@EXAMPLE.COM",
        password: "password",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("john@example.com");
      }
    });
  });

  describe("forgotPasswordSchema", () => {
    it("validates a correct email", () => {
      const result = ForgotPasswordSchema.safeParse({
        email: "john@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = ForgotPasswordSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("transforms email to lowercase", () => {
      const result = ForgotPasswordSchema.safeParse({
        email: "JOHN@EXAMPLE.COM",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("john@example.com");
      }
    });
  });
});
