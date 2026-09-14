import { beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileGate } from "./MobileGate";
import {
  advanceLevel,
  createInitialMobileGameState,
  currentPiece,
  dropPiece,
  type MobileGameState,
  setHoverSlot,
  skipToEnd,
  startGame,
} from "./mobile-game.state";

/** Script a full run through the reducer so the gate lands on the end screen. */
const finishedState = (): MobileGameState => {
  let state = startGame(createInitialMobileGameState(), 0);
  let now = 0;
  while (state.phase === "playing" || state.phase === "levelClear") {
    if (state.phase === "levelClear") state = advanceLevel(state, now);
    const piece = currentPiece(state);
    if (!piece) break;
    now += 1_000;
    state = dropPiece(setHoverSlot(state, piece.target), now);
  }
  return state;
};

describe("MobileGate", () => {
  const mockWindowOpen = mock();
  const mockWriteText = mock(() => Promise.resolve());

  beforeEach(() => {
    mockWindowOpen.mockClear();
    mockWriteText.mockClear();
    window.open = mockWindowOpen;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mockWriteText },
    });
  });

  describe("Intro", () => {
    it("leads with the desktop pitch, then the game with play and skip actions", () => {
      render(<MobileGate />);

      // The product comes first so phone visitors don't mistake the game
      // for the app; the game is framed as a bonus while they're here.
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Compass is a keyboard-first calendar",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "It's built for the desktop, so it doesn't run on phones yet. While you're here, we made you a little game for fun.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: "Time Block Party" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^play$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /skip to desktop link/i }),
      ).toBeInTheDocument();
    });

    it("starts the game when Play is tapped", async () => {
      const user = userEvent.setup();
      render(<MobileGate />);

      await user.click(screen.getByRole("button", { name: /^play$/i }));

      expect(screen.getByText(/level 1 of 3/i)).toBeInTheDocument();
      // The first piece's tray card is up, ready to drag.
      expect(screen.getByText("Standup")).toBeInTheDocument();
      expect(
        screen.getByText("Drag the event onto the calendar, or tap it first"),
      ).toBeInTheDocument();
    });
  });

  describe("Time Block Party placements", () => {
    const boardRect = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 200,
      height: 400,
      right: 200,
      bottom: 400,
      toJSON: () => {},
    } as DOMRect;

    const mockBoardRect = () => {
      const board = screen.getByRole("region", { name: "Calendar" });
      board.getBoundingClientRect = () => boardRect;
      return board;
    };

    const startPlaying = async () => {
      const user = userEvent.setup();
      render(<MobileGate />);
      await user.click(screen.getByRole("button", { name: /^play$/i }));
      return screen.getByRole("button", { name: /standup/i });
    };

    const tap = (target: HTMLElement, clientX: number, clientY: number) => {
      fireEvent.pointerDown(target, { pointerId: 1, clientX, clientY });
      fireEvent.pointerUp(target, { pointerId: 1, clientX, clientY });
    };

    it("places the piece when the card is tapped then a calendar slot is tapped", async () => {
      const card = await startPlaying();
      const board = mockBoardRect();

      tap(card, 20, 500);
      expect(card).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByText("Now tap where it goes on the calendar"),
      ).toBeInTheDocument();

      tap(board, 100, 25);

      expect(screen.getByText("150")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /deep work/i }),
      ).toBeInTheDocument();
    });

    it("disarms the piece when the card is tapped a second time", async () => {
      const card = await startPlaying();

      tap(card, 20, 500);
      expect(card).toHaveAttribute("aria-pressed", "true");
      tap(card, 20, 500);
      expect(card).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByText("Drag the event onto the calendar, or tap it first"),
      ).toBeInTheDocument();
    });

    it("still places the piece when it is dragged onto its slot", async () => {
      const card = await startPlaying();
      mockBoardRect();

      fireEvent.pointerDown(card, { pointerId: 1, clientX: 20, clientY: 500 });
      fireEvent.pointerMove(card, { pointerId: 1, clientX: 100, clientY: 25 });
      fireEvent.pointerUp(card, { pointerId: 1, clientX: 100, clientY: 25 });

      expect(screen.getByText("150")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /deep work/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Desktop handoff after skipping", () => {
    const skipToHandoff = async () => {
      const user = userEvent.setup();
      render(<MobileGate />);
      await user.click(
        screen.getByRole("button", { name: /skip to desktop link/i }),
      );
      return user;
    };

    it("renders the desktop-first title as the page heading", async () => {
      await skipToHandoff();

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Open Compass on a computer");
    });

    it("renders the descriptive message", async () => {
      await skipToHandoff();

      expect(
        screen.getByText(/Copy this link and open it on a laptop or desktop/),
      ).toBeInTheDocument();
    });

    it("hides the score summary on the skip path", async () => {
      await skipToHandoff();

      expect(screen.queryByText(/\d+ points/)).not.toBeInTheDocument();
    });

    it("copies the current URL to the clipboard", async () => {
      const user = await skipToHandoff();

      await user.click(
        screen.getByRole("button", { name: /copy link for desktop/i }),
      );

      expect(
        await screen.findByRole("button", { name: /link copied/i }),
      ).toBeInTheDocument();
    });

    it("opens the waitlist URL in a new tab", async () => {
      const user = await skipToHandoff();

      await user.click(
        screen.getByRole("button", { name: /join mobile waitlist/i }),
      );

      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
      expect(mockWindowOpen).toHaveBeenCalledWith(
        "https://tylerdane.kit.com/compass-mobile",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  describe("End screen after a finished run", () => {
    it("shows the score alongside the desktop CTAs and a replay action", () => {
      const state = finishedState();
      expect(state.phase).toBe("ended");
      render(<MobileGate initialState={state} />);

      expect(
        screen.getByText(`${state.score.toLocaleString()} points`),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /copy link for desktop/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /join mobile waitlist/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /play again/i }),
      ).toBeInTheDocument();
    });

    it("restarts a fresh run from Play again", async () => {
      const user = userEvent.setup();
      render(<MobileGate initialState={finishedState()} />);

      await user.click(screen.getByRole("button", { name: /play again/i }));

      expect(screen.getByText(/level 1 of 3/i)).toBeInTheDocument();
      // Fresh run: the score readout is back to zero.
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("offers the game from the skip path's end screen", () => {
      render(
        <MobileGate initialState={skipToEnd(createInitialMobileGameState())} />,
      );

      expect(
        screen.getByRole("button", { name: /play time block party/i }),
      ).toBeInTheDocument();
    });
  });

  it("locks app shortcuts while mounted", () => {
    const { unmount } = render(<MobileGate />);

    expect(document.body.dataset.appLocked).toBe("true");
    unmount();
    expect(document.body.dataset.appLocked).toBeUndefined();
  });
});
