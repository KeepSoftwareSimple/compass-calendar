import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventDetailsSection } from "@web/views/Forms/EventForm/EventDetailsSection";
import { describe, expect, it, mock } from "bun:test";

mock.module("@web/common/utils/clipboard/clipboard.util", () => ({
  copyText: mock(async () => true),
}));

const details = {
  organizer: { email: "host@example.com", displayName: "Host" },
  attendees: [
    {
      email: "host@example.com",
      displayName: "Host",
      responseStatus: "accepted" as const,
    },
    {
      email: "guest@example.com",
      displayName: "Guest One",
      responseStatus: "needsAction" as const,
    },
  ],
};

describe("EventDetailsSection", () => {
  it("copies the meeting link from a button beside the join link", async () => {
    const user = userEvent.setup();
    render(
      <EventDetailsSection
        details={{
          organizer: null,
          attendees: [],
          conference: {
            url: "https://meet.google.com/abc-defg-hij",
            label: "Google Meet",
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Google Meet" })).toHaveAttribute(
      "id",
      "event-form-conference",
    );
    await user.click(screen.getByRole("button", { name: "copy meeting link" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("copies each guest email instead of the whole attendee list", async () => {
    const user = userEvent.setup();
    render(<EventDetailsSection details={details} />);

    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "copy host@example.com" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "copy guest@example.com" }),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("copies a guest email when the copy button is activated from the keyboard", async () => {
    const user = userEvent.setup();
    render(<EventDetailsSection details={details} />);

    screen.getByRole("button", { name: "copy guest@example.com" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });
});
