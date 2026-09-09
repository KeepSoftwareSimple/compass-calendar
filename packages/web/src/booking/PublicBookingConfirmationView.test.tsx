import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicBookingConfirmationView } from "@web/booking/PublicBookingConfirmationView";
import {
  formatBookingSlotLabel,
  formatDurationMinutes,
} from "@web/booking/public-booking.format";
import { describe, expect, it, mock } from "bun:test";

const slotStart = "2026-09-15T15:00:00.000Z";
const timeZone = "UTC";
const cancelUrl =
  "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc";
const rescheduleUrl =
  "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc";

describe("PublicBookingConfirmationView", () => {
  it("shows the slot summary instead of a raw cancel URL", () => {
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(
      screen.getByText(formatBookingSlotLabel(slotStart, timeZone)),
    ).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText(formatDurationMinutes(30))).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(screen.queryByText(cancelUrl)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Cancel this meeting" }),
    ).toHaveAttribute("href", cancelUrl);
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reschedule this meeting" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("A Google Meet invite is on its way to your email."),
    ).toBeInTheDocument();
  });

  it("shows cancel then reschedule actions when both URLs are present", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        rescheduleUrl={rescheduleUrl}
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    const heading = screen.getByRole("heading", {
      name: "You're meeting with Tyler Dane",
    });
    expect(screen.queryByText(rescheduleUrl)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reschedule this meeting" }),
    ).toHaveAttribute("href", rescheduleUrl);
    expect(
      screen.getByRole("group", { name: "Meeting actions" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);

    heading.focus();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Cancel this meeting" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Reschedule this meeting" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
  });

  it("promises a calendar invite when the destination cannot mint Meet", () => {
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        createsGoogleMeet={false}
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.getByText("The calendar invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A Google Meet invite is on its way to your email."),
    ).not.toBeInTheDocument();
  });

  it("promises a Teams invite when the destination conference is teams", () => {
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        conference="teams"
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.getByText("A Microsoft Teams invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A Google Meet invite is on its way to your email."),
    ).not.toBeInTheDocument();
  });

  it("promises a calendar invite when the destination conference is none", () => {
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        conference="none"
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.getByText("The calendar invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A Google Meet invite is on its way to your email."),
    ).not.toBeInTheDocument();
  });

  it("hides copy and cancel controls without a cancel URL", () => {
    render(
      <PublicBookingConfirmationView
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Meeting actions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "cancel this meeting" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Cancel this meeting" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reschedule this meeting" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("A Google Meet invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/To cancel, use the link in that invite/),
    ).not.toBeInTheDocument();
  });

  it("shows notes and Edit details when provided", async () => {
    const user = userEvent.setup({ delay: null });
    const onEditDetails = mock(() => undefined);
    render(
      <PublicBookingConfirmationView
        cancelUrl={cancelUrl}
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes="bring coffee"
        onEditDetails={onEditDetails}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("bring coffee")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEditDetails).toHaveBeenCalledTimes(1);
  });

  it("hides Edit details without an edit handler", () => {
    render(
      <PublicBookingConfirmationView
        durationMinutes={30}
        hostDisplayName="Tyler Dane"
        guestName="Ada Lovelace"
        notes={null}
        slotStart={slotStart}
        timeZone={timeZone}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
  });
});
