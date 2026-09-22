import { App } from "@booking-web/App";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

describe("App", () => {
  it("renders the booking scaffold heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Compass Booking" }),
    ).toBeTruthy();
  });
});
