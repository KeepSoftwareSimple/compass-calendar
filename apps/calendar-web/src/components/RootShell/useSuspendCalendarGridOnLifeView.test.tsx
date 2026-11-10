import { act, renderHook } from "@testing-library/react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

let mockPathname: string = ROOT_ROUTES.WEEK;

const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };
let isRouterMocked = true;

mock.module("@tanstack/react-router", () => ({
  ...actualTanstackRouter,
  useLocation: (...args: unknown[]) =>
    isRouterMocked
      ? { pathname: mockPathname }
      : // biome-ignore lint/correctness/useHookAtTopLevel: mock.module factory
        actualTanstackRouter.useLocation(...(args as [])),
}));

const { useSuspendCalendarGridOnLifeView } = await import(
  "./useSuspendCalendarGridOnLifeView"
);

afterAll(() => {
  isRouterMocked = false;
});

describe("useSuspendCalendarGridOnLifeView", () => {
  beforeEach(() => {
    useDraftStore.setState(initialDraftState, true);
    mockPathname = ROOT_ROUTES.WEEK;
  });

  it("keeps an open createShortcut form when the user switches to Life", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );
    draft.values.title = "Typed in the form";
    draftActions.startGridDraft({ activity: "createShortcut", draft });

    const { rerender } = renderHook(() => useSuspendCalendarGridOnLifeView());
    act(() => {
      mockPathname = ROOT_ROUTES.LIFE;
      rerender();
    });

    expect(useDraftStore.getState().gridDraft?.values.title).toBe(
      "Typed in the form",
    );
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
  });
});
