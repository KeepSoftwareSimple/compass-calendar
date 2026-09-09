import "@testing-library/jest-dom";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingCopyLink } from "@web/booking/BookingCopyLink";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const mockTrack = mock();
const actualTrack = { ...(await import("@web/auth/posthog/track")) };
let isTrackMocked = true;
mock.module("@web/auth/posthog/track", () => ({
  ...actualTrack,
  track: (...args: Parameters<typeof actualTrack.track>) =>
    isTrackMocked ? mockTrack(...args) : actualTrack.track(...args),
}));

afterAll(() => {
  isTrackMocked = false;
});

describe("BookingCopyLink", () => {
  const mockWriteText = mock(() => Promise.resolve());

  beforeEach(() => {
    mockWriteText.mockClear();
    mockTrack.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockWriteText },
    });
  });

  it("copies the booking link", async () => {
    const bookingUrl = "https://compasscalendar.com/meet/hostuser";
    render(<BookingCopyLink bookingUrl={bookingUrl} />);

    fireEvent.click(screen.getByLabelText("Copy meeting link"));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(bookingUrl);
    });
    expect(mockTrack).toHaveBeenCalledWith("booking_link_copied", {
      source: "button",
    });
  });

  it("opens the public booking page in a new tab", () => {
    const bookingUrl = "https://compasscalendar.com/meet/hostuser";
    render(<BookingCopyLink bookingUrl={bookingUrl} />);

    const openLink = screen.getByRole("link", { name: "Open meeting page" });
    expect(openLink).toHaveAttribute("href", bookingUrl);
    expect(openLink).toHaveAttribute("target", "_blank");
    expect(openLink).toHaveAttribute("rel", "noreferrer");
  });

  it("hides the open-page link when showOpen is false", () => {
    render(
      <BookingCopyLink
        bookingUrl="https://compasscalendar.com/meet/hostuser"
        showOpen={false}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Open meeting page" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Meeting link")).toHaveValue(
      "https://compasscalendar.com/meet/hostuser",
    );
    expect(
      screen.getByRole("button", { name: "Copy meeting link" }),
    ).toBeInTheDocument();
  });

  it("explains the copy icon in a tooltip", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BookingCopyLink bookingUrl="https://compasscalendar.com/meet/hostuser" />,
    );

    await user.hover(screen.getByRole("button", { name: "Copy meeting link" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Copy meeting link",
    );
  });

  it("explains the open-page icon in a tooltip", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BookingCopyLink bookingUrl="https://compasscalendar.com/meet/hostuser" />,
    );

    await user.hover(screen.getByRole("link", { name: "Open meeting page" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Open meeting page",
    );
  });
});

const originalClipboard = navigator.clipboard;

const setClipboard = (value: unknown) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
    writable: true,
  });
};

afterEach(() => {
  cleanup();
  setClipboard(originalClipboard);
});

describe("copyText", () => {
  it("reports success when the write lands", async () => {
    const writeText = mock(() => Promise.resolve());
    setClipboard({ writeText });

    expect(await copyText("https://example.com/meet/tyler")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.com/meet/tyler");
  });

  it("reports failure instead of rejecting when permission is denied", async () => {
    // The three call sites used to invoke writeText with no .catch(), so this
    // surfaced as an unhandled rejection and the button just sat there.
    setClipboard({ writeText: () => Promise.reject(new Error("denied")) });

    expect(await copyText("anything")).toBe(false);
  });

  it("reports failure when there is no clipboard at all", async () => {
    setClipboard(undefined);

    expect(await copyText("anything")).toBe(false);
  });
});
