import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AppleButton } from "@web/components/AuthModal/components/AppleButton";
import { describe, expect, it, mock } from "bun:test";

describe("AppleButton", () => {
  it("matches the light provider button treatment", () => {
    render(<AppleButton onClick={mock()} label="Continue with Apple" />);

    const button = screen.getByRole("button", { name: "Continue with Apple" });
    expect(button).toHaveClass("bg-[#fff]", "text-[#1f1f1f]");
    expect(button).not.toHaveClass("bg-[#000]");
  });
});
