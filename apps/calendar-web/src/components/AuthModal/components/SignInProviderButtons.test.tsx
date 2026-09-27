import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInProviderButtons } from "@web/components/AuthModal/components/SignInProviderButtons";
import { describe, expect, it, mock } from "bun:test";

describe("SignInProviderButtons", () => {
  it("renders all three provider buttons with whole-string labels", () => {
    render(
      <SignInProviderButtons
        available={["google", "microsoft", "apple"]}
        loadingKind={null}
        onSignIn={mock()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toHaveTextContent("Continue with Google");
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toHaveClass("w-full");
    expect(
      screen.getByRole("button", { name: "Continue with Microsoft" }),
    ).toHaveClass("w-full");
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toHaveClass("w-full");
    expect(
      screen.getByRole("button", { name: "Continue with Microsoft" }),
    ).toHaveTextContent("Continue with Microsoft");
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toHaveTextContent("Continue with Apple");
    expect(
      screen.queryByText("Signs you up and connects your Google Calendar."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Signs you up and connects your Outlook calendar."),
    ).not.toBeInTheDocument();
  });

  it("stretches the button stack to the container width", () => {
    const { container } = render(
      <SignInProviderButtons
        available={["google"]}
        loadingKind={null}
        onSignIn={mock()}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      "w-full",
      "flex",
      "flex-col",
    );
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toHaveClass("w-full");
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toHaveStyle({ width: "100%" });
  });

  it("calls onSignIn with the clicked provider kind", async () => {
    const user = userEvent.setup();
    const onSignIn = mock();
    render(
      <SignInProviderButtons
        available={["google", "microsoft"]}
        loadingKind={null}
        onSignIn={onSignIn}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continue with Microsoft" }),
    );

    expect(onSignIn).toHaveBeenCalledWith("microsoft");
  });

  it("renders custom labels as the accessible names", () => {
    render(
      <SignInProviderButtons
        available={["google", "microsoft", "apple"]}
        labels={{
          google: "Connect Google Calendar",
          microsoft: "Connect Microsoft Calendar",
          apple: "Connect Apple Calendar",
        }}
        loadingKind={null}
        onSignIn={mock()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Connect Microsoft Calendar" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Connect Apple Calendar" }),
    ).toBeTruthy();
  });

  it("hides shortcut chips when shortcutKeys is null", () => {
    render(
      <SignInProviderButtons
        available={["google", "microsoft", "apple"]}
        loadingKind={null}
        onSignIn={mock()}
        shortcutKeys={null}
      />,
    );

    expect(screen.queryByText("G")).toBeNull();
    expect(screen.queryByText("M")).toBeNull();
    expect(screen.queryByText("A")).toBeNull();
  });

  it("relabels the loading pill and disables the others", () => {
    render(
      <SignInProviderButtons
        available={["google", "microsoft", "apple"]}
        busyLabel={(kind) => `Opening ${kind}…`}
        loadingKind="microsoft"
        onSignIn={mock()}
      />,
    );

    const busy = screen.getByRole("button", { name: "Opening microsoft…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeDisabled();
  });
});
