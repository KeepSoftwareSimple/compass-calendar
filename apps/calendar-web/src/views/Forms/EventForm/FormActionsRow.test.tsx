import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const cancelReservation = mock(() => Promise.resolve());
mock.module("@web/api/booking.api", () => ({
  BookingApi: { cancelReservation },
}));

const showStatusToast = mock();
mock.module("@web/common/utils/toast/status-toast.util", () => ({
  showStatusToast,
}));

const { FormActionsRow } =
  require("@web/views/Forms/EventForm/FormActionsRow") as typeof import("@web/views/Forms/EventForm/FormActionsRow");

const reservationId = "507f1f77bcf86cd799439011";
const token = "plain-guest-token";
const bookingLinks = {
  reservationId,
  token,
  cancelUrl: `https://compass.example/meet/cancel/${reservationId}?token=${token}`,
  rescheduleUrl: `https://compass.example/meet/reschedule/${reservationId}?token=${token}`,
};

const renderRow = (props: Partial<Parameters<typeof FormActionsRow>[0]> = {}) =>
  render(
    <FormActionsRow
      isExistingEvent={true}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      {...props}
    />,
  );

const actionRow = () => screen.getByRole("group", { name: "Event actions" });
const buttons = () => within(actionRow()).getAllByRole("button");

afterEach(cleanup);

describe("FormActionsRow", () => {
  beforeEach(() => {
    cancelReservation.mockClear();
    showStatusToast.mockClear();
  });

  it("renders duplicate, delete and close for a saved, writable event", () => {
    renderRow();

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Delete", "Close"]);
  });

  it("hides duplicate for an unsaved draft, which has nothing to copy", () => {
    renderRow({ isExistingEvent: false });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Delete", "Close"]);
  });

  it("hides delete for a read-only event but keeps duplicate and close", () => {
    renderRow({ isReadOnly: true });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Close"]);
  });

  it("shows booking actions for a booked event and hides them when read-only", () => {
    renderRow({ bookingLinks, guestDisplayName: "Bob" });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Cancel meeting", "Reschedule", "Delete", "Close"]);

    cleanup();
    renderRow({ bookingLinks, guestDisplayName: "Bob", isReadOnly: true });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Close"]);
  });

  it("confirms cancel on a second click and posts the public cancel endpoint", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    renderRow({ bookingLinks, guestDisplayName: "Bob", onClose });

    await user.click(screen.getByRole("button", { name: "Cancel meeting" }));
    await user.click(screen.getByRole("button", { name: "Confirm cancel" }));

    await waitFor(() => {
      expect(cancelReservation).toHaveBeenCalledTimes(1);
    });
    expect(cancelReservation).toHaveBeenCalledWith(reservationId, { token });
    expect(showStatusToast).toHaveBeenCalledWith(
      "booking-cancel-meeting",
      "Meeting cancelled. Bob was emailed.",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reverts confirm cancel when focus leaves the button", async () => {
    const user = userEvent.setup();
    renderRow({ bookingLinks });

    const cancelButton = screen.getByRole("button", { name: "Cancel meeting" });
    await user.click(cancelButton);
    expect(
      screen.getByRole("button", { name: "Confirm cancel" }),
    ).toBeInTheDocument();

    fireEvent.blur(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(
      screen.getByRole("button", { name: "Cancel meeting" }),
    ).toBeInTheDocument();
  });

  it("opens the reschedule URL in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = mock();
    const originalOpen = window.open;
    window.open = openSpy as typeof window.open;

    renderRow({ bookingLinks });
    await user.click(screen.getByRole("button", { name: "Reschedule" }));

    expect(openSpy).toHaveBeenCalledWith(
      bookingLinks.rescheduleUrl,
      "_blank",
      "noopener,noreferrer",
    );

    window.open = originalOpen;
  });

  it("puts every action in the tab order", () => {
    renderRow();

    expect(buttons().map((button) => button.getAttribute("tabindex"))).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("tabs through duplicate, delete, and close in DOM order", async () => {
    const user = userEvent.setup();
    renderRow();
    const [duplicate, deleteButton, close] = buttons();

    duplicate.focus();
    await user.tab();
    expect(deleteButton).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(deleteButton).toHaveFocus();
  });

  it("activates the focused action with Enter after tabbing to it", async () => {
    const user = userEvent.setup();
    const onDelete = mock();
    renderRow({ onDelete });
    const [duplicate, deleteButton] = buttons();

    duplicate.focus();
    await user.tab();
    expect(deleteButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("calls the matching handler when a button is activated", async () => {
    const user = userEvent.setup();
    const onDuplicate = mock();
    const onDelete = mock();
    const onClose = mock();
    renderRow({ onClose, onDelete, onDuplicate });

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reveals each action's shortcut on hover, so the keys are learnable", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.hover(screen.getByRole("button", { name: "Duplicate" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("DuplicateD");
  });
});
