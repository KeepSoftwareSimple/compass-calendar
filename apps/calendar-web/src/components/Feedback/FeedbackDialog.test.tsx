import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FeedbackDialog } from "@web/components/Feedback/FeedbackDialog";
import { restoreCommandPaletteFocus } from "@web/components/Feedback/FeedbackDialogHost";
import { describe, expect, it, mock } from "bun:test";

describe("FeedbackDialog", () => {
  it("submits trimmed feedback details", async () => {
    const user = userEvent.setup();
    const onSubmit = mock();

    const { rerender } = render(
      <FeedbackDialog onDismiss={mock()} onSubmit={onSubmit} />,
    );

    expect(
      screen.getByRole("dialog", { name: "Share feedback" }),
    ).toBeInTheDocument();
    const details = screen.getByRole("textbox", {
      name: "What would you like to share?",
    });
    expect(details).toHaveFocus();
    expect(details).toHaveAccessibleDescription(
      "We'll include your account, app version, current view, and session details so we can follow up and troubleshoot.",
    );
    expect(
      screen.getByRole("button", { name: "Send feedback" }),
    ).toBeDisabled();

    await user.type(details, "  Events disappear after syncing.  ");
    rerender(
      <FeedbackDialog isSubmitting onDismiss={mock()} onSubmit={onSubmit} />,
    );
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Share feedback" }),
    ).toBeInTheDocument();
    expect(details).toHaveFocus();

    rerender(<FeedbackDialog onDismiss={mock()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(onSubmit).toHaveBeenCalledWith("Events disappear after syncing.");
  });

  it("dismisses without submitting", async () => {
    const user = userEvent.setup();
    const onDismiss = mock();
    const onSubmit = mock();

    render(<FeedbackDialog onDismiss={onDismiss} onSubmit={onSubmit} />);

    expect(
      screen.getByRole("textbox", { name: "What would you like to share?" }),
    ).toHaveAttribute("placeholder", "Tell us what you think.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("restores focus after Escape closes the dialog", async () => {
    const user = userEvent.setup();

    function FeedbackDialogWithTrigger() {
      const [open, setOpen] = useState(true);

      return (
        <>
          <button
            type="button"
            aria-label="Open command palette, syncing in the background"
          />
          {open ? (
            <FeedbackDialog
              onDismiss={() => setOpen(false)}
              restoreFocus={() =>
                document
                  .querySelector<HTMLButtonElement>(
                    'button[aria-label^="Open command palette"]',
                  )
                  ?.focus()
              }
              onSubmit={mock()}
            />
          ) : null}
        </>
      );
    }

    render(<FeedbackDialogWithTrigger />);
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Open command palette, syncing in the background",
        }),
      ).toHaveFocus(),
    );
  });

  it("can restore focus to the collapsed sidebar trigger", async () => {
    const user = userEvent.setup();

    function FeedbackDialogWithCollapsedSidebar() {
      const [open, setOpen] = useState(true);

      return (
        <>
          <button type="button" aria-label="Open sidebar" />
          {open ? (
            <FeedbackDialog
              onDismiss={() => setOpen(false)}
              restoreFocus={restoreCommandPaletteFocus}
              onSubmit={mock()}
            />
          ) : null}
        </>
      );
    }

    render(<FeedbackDialogWithCollapsedSidebar />);
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open sidebar" }),
      ).toHaveFocus(),
    );
  });
});
