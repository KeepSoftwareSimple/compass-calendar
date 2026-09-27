import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { createUseTasksRemovalNotice } from "./useTasksRemovalNotice";
import { beforeEach, describe, expect, it, mock } from "bun:test";

describe("useTasksRemovalNotice", () => {
  const ensureOfflineDataStoreReady = mock();
  const getTaskCount = mock();
  const getOfflineDataStore = mock(() => ({ getTaskCount }));
  const hasDismissedTasksRemovalNotice = mock();
  const markTasksRemovalNoticeDismissed = mock();

  const buildHook = () =>
    createUseTasksRemovalNotice({
      ensureOfflineDataStoreReady,
      getOfflineDataStore,
      hasDismissedTasksRemovalNotice,
      markTasksRemovalNoticeDismissed,
    });

  beforeEach(() => {
    ensureOfflineDataStoreReady.mockClear();
    getTaskCount.mockClear();
    getOfflineDataStore.mockClear();
    hasDismissedTasksRemovalNotice.mockClear();
    markTasksRemovalNoticeDismissed.mockClear();

    ensureOfflineDataStoreReady.mockResolvedValue(undefined);
    hasDismissedTasksRemovalNotice.mockReturnValue(false);
  });

  it("is not visible when there are no leftover tasks", async () => {
    getTaskCount.mockResolvedValue(0);
    const useTasksRemovalNotice = buildHook();

    const { result } = renderHook(() => useTasksRemovalNotice());

    await waitFor(() => {
      expect(getTaskCount).toHaveBeenCalledTimes(1);
    });
    expect(result.current.visible).toBe(false);
  });

  it("is not visible when already dismissed, and never checks the task count", async () => {
    hasDismissedTasksRemovalNotice.mockReturnValue(true);
    const useTasksRemovalNotice = buildHook();

    const { result } = renderHook(() => useTasksRemovalNotice());

    expect(result.current.visible).toBe(false);
    expect(getTaskCount).not.toHaveBeenCalled();
  });

  it("becomes visible once the task count resolves above zero", async () => {
    getTaskCount.mockResolvedValue(2);
    const useTasksRemovalNotice = buildHook();

    const { result } = renderHook(() => useTasksRemovalNotice());

    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
  });

  it("dismiss() hides the card immediately and persists the flag", async () => {
    getTaskCount.mockResolvedValue(1);
    const useTasksRemovalNotice = buildHook();

    const { result } = renderHook(() => useTasksRemovalNotice());

    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.visible).toBe(false);
    expect(markTasksRemovalNoticeDismissed).toHaveBeenCalledTimes(1);
  });

  it("fails closed (not visible) if the task count check errors", async () => {
    getTaskCount.mockRejectedValue(new Error("dexie is closed"));
    const useTasksRemovalNotice = buildHook();

    const { result } = renderHook(() => useTasksRemovalNotice());

    await waitFor(() => {
      expect(getTaskCount).toHaveBeenCalledTimes(1);
    });
    expect(result.current.visible).toBe(false);
  });
});
