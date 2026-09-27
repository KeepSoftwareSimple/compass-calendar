import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type ReplaceEventInput } from "@core/types/event-command.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import {
  undoHistoryActions,
  useUndoHistoryStore,
} from "@web/events/stores/undo.store";
import { useUndoRedoShortcuts } from "./useUndoRedoShortcuts";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const before = createMockEvent({
  content: { kind: "details", title: "Before", description: "" },
});

const editEntry = {
  kind: "edit" as const,
  id: before.id,
  before,
  after: {
    ...before,
    content: { kind: "details" as const, title: "After", description: "" },
  },
};

const editMutations = (queryClient: QueryClient) =>
  queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.options.mutationKey?.[2] === "replace")
    .map((mutation) => {
      const { input } = mutation.state.variables as {
        input: ReplaceEventInput;
      };
      return input.content.kind === "details" ? input.content.title : null;
    });

const replaceMutationsSettled = (queryClient: QueryClient) =>
  queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.options.mutationKey?.[2] === "replace")
    .every((mutation) => mutation.state.status === "success");

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const repository: EventRepository = {
    list: async () => [],
    create: async (input) => ({ ...before, id: input.id as EventId }),
    replace: async (id: EventId, input): Promise<Event> => {
      // The write contract's guest-edit field never round-trips into the
      // read-side Event content this stub returns.
      const { attendees: _guestEdit, ...content } = input.content;
      return { ...before, id, content, schedule: input.schedule };
    },
    delete: async () => {},
  };
  const dependencies = {
    source: "local" as const,
    repository,
    markWrite: async () => {},
    reportError: () => {},
  };
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>{children}</HotkeysProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useUndoRedoShortcuts(dependencies), {
    wrapper,
  });
  return { hook, queryClient };
};

describe("useUndoRedoShortcuts", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("undoes the last change on Mod+Z", async () => {
    const { queryClient } = setup();
    act(() => undoHistoryActions.record(editEntry));

    act(() => {
      pressKey("z", { keyDownInit: { ctrlKey: true } });
    });
    await waitFor(() => {
      expect(editMutations(queryClient)).toEqual(["Before"]);
      expect(replaceMutationsSettled(queryClient)).toBe(true);
    });
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(useUndoHistoryStore.getState().future).toHaveLength(1);
  });

  it("redoes on Mod+Shift+Z without also undoing", async () => {
    const { queryClient } = setup();
    act(() => undoHistoryActions.record(editEntry));
    act(() => {
      pressKey("z", { keyDownInit: { ctrlKey: true } });
    });
    await waitFor(() => {
      expect(editMutations(queryClient)).toEqual(["Before"]);
      expect(replaceMutationsSettled(queryClient)).toBe(true);
    });

    act(() => {
      pressKey("z", { keyDownInit: { ctrlKey: true, shiftKey: true } });
    });
    await waitFor(() => {
      expect(editMutations(queryClient)).toEqual(["Before", "After"]);
      expect(replaceMutationsSettled(queryClient)).toBe(true);
    });
    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
    expect(useUndoHistoryStore.getState().future).toHaveLength(0);
  });

  it("does not fire inside text inputs, preserving native text undo", () => {
    const { queryClient } = setup();
    act(() => undoHistoryActions.record(editEntry));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      pressKey("z", { keyDownInit: { ctrlKey: true } }, input);
    });

    expect(editMutations(queryClient)).toEqual([]);
    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
  });
});
