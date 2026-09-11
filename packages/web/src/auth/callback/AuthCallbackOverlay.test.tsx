import { render, screen } from "@testing-library/react";
import { AuthCallbackOverlay } from "@web/auth/callback/AuthCallbackOverlay";
import { describe, expect, it } from "bun:test";

describe("AuthCallbackOverlay", () => {
  it("announces that the sign-in is finishing", () => {
    render(<AuthCallbackOverlay />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Just finishing up");
    expect(status).toHaveTextContent("Returning you to Compass.");
  });
});
