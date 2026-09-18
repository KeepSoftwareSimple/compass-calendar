import { type EventId } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@web/__tests__/__mocks__/mock.render";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { useShiftHoldEventHints } from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import { RecurrenceScopeOpportunityHost } from "./RecurrenceScopeOpportunityHost";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const occurrence = () =>
  createMockEvent({
    recurrence: {
      kind: "occurrence",
      seriesId: "0123456789abcdef11111111" as EventId,
    },
  });

const beginReadyAsk = () =>
  recurrenceScopeOpportunityActions.begin({
    kind: "delete",
    original: occurrence(),
    source: "local",
  });

const beginDeferredEditAsk = (event = occurrence()) =>
  recurrenceScopeOpportunityActions.begin(
    {
      kind: "replace",
      original: event,
      input: {
        calendarId: event.calendarId,
        content: {
          kind: "details" as const,
          title: "Test",
          description: "",
          location: "",
        },
        schedule: event.schedule,
        recurrence: { kind: "preserve" as const },
        scope: "this" as const,
      },
      source: "local",
    },
    { deferred: true },
  );

const pressDigit = (value: "1" | "2") =>
  fireEvent.keyDown(document, { key: value, code: `Digit${value}` });

const releaseShift = () =>
  fireEvent.keyUp(document, { key: "Shift", code: "ShiftLeft" });

describe("RecurrenceScopeOpportunityHost", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-app-locked");
    recurrenceScopeOpportunityActions.reset();
  });

  afterEach(() => {
    cleanup();
    resetToastPort();
    recurrenceScopeOpportunityActions.reset();
  });

  it("promotes following with 1", async () => {
    const id = beginReadyAsk();
    const requestPromotion = spyOn(
      recurrenceScopeOpportunityActions,
      "requestPromotion",
    );

    render(<RecurrenceScopeOpportunityHost />);
    pressDigit("1");

    await waitFor(() => {
      expect(requestPromotion).toHaveBeenCalledWith(id, "thisAndFollowing");
    });
    requestPromotion.mockRestore();
  });

  it("promotes the live opportunity with 2", async () => {
    const id = beginReadyAsk();
    const requestPromotion = spyOn(
      recurrenceScopeOpportunityActions,
      "requestPromotion",
    );

    render(<RecurrenceScopeOpportunityHost />);
    pressDigit("2");

    await waitFor(() => {
      expect(requestPromotion).toHaveBeenCalledWith(id, "all");
    });
    requestPromotion.mockRestore();
  });

  it("does not steal 1 when no series-scope toast is live", () => {
    const requestPromotion = spyOn(
      recurrenceScopeOpportunityActions,
      "requestPromotion",
    );

    render(<RecurrenceScopeOpportunityHost />);
    pressDigit("1");

    expect(requestPromotion).not.toHaveBeenCalled();
    requestPromotion.mockRestore();
  });

  it("takes 1 from quick-time create while the toast is live", async () => {
    const id = beginReadyAsk();
    const requestPromotion = spyOn(
      recurrenceScopeOpportunityActions,
      "requestPromotion",
    );
    const createAt = mock((_start: Dayjs) => {});

    render(<RecurrenceScopeOpportunityHost />);
    renderHook(() =>
      useShiftHoldEventHints({
        createAtTime: createAt,
        focus: () => {},
        getQuickTimeDay: () => dayjs().startOf("day"),
        listVisible: () => [],
        timedEvents: [],
        visibleDays: [dayjs().startOf("day")],
      }),
    );

    pressDigit("1");

    await waitFor(() => {
      expect(requestPromotion).toHaveBeenCalledWith(id, "thisAndFollowing");
    });
    expect(createAt).not.toHaveBeenCalled();
    requestPromotion.mockRestore();
  });

  it("shows no toast while a deferred ask is pending, then shows it on Shift release", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);

    beginDeferredEditAsk();
    render(<RecurrenceScopeOpportunityHost />);

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalled());
    expect(mocks.toast).not.toHaveBeenCalled();

    releaseShift();

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  });

  it("ignores 1 while a deferred ask is pending", () => {
    beginDeferredEditAsk();
    const requestPromotion = spyOn(
      recurrenceScopeOpportunityActions,
      "requestPromotion",
    );

    render(<RecurrenceScopeOpportunityHost />);
    pressDigit("1");

    expect(requestPromotion).not.toHaveBeenCalled();
    requestPromotion.mockRestore();
  });

  it("settles a pending ask when the window loses focus", async () => {
    beginDeferredEditAsk();
    render(<RecurrenceScopeOpportunityHost />);

    fireEvent.blur(window);

    await waitFor(() => {
      expect(
        useRecurrenceScopeOpportunityStore.getState().opportunity?.status,
      ).toBe("ready");
    });
  });
});
