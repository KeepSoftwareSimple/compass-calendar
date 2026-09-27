import { getAuthSubmitErrorMessage } from "./useAuthFormHandlers.util";
import { describe, expect, it } from "bun:test";

describe("getAuthSubmitErrorMessage", () => {
  it("does not show raw API failure text when the backend cannot be reached", () => {
    const error = new Error("Request failed");
    error.name = "ApiError";

    expect(getAuthSubmitErrorMessage(error, "Unable to log in")).toBe(
      "We can't reach Compass right now. Please check your connection and try again.",
    );
  });

  it("does not show raw fetch failure text when the backend cannot be reached", () => {
    expect(
      getAuthSubmitErrorMessage(
        new TypeError("Failed to fetch"),
        "Unable to log in",
      ),
    ).toBe(
      "We can't reach Compass right now. Please check your connection and try again.",
    );
  });
});
