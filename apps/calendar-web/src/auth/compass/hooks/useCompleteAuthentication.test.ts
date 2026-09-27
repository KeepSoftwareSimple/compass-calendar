import { renderHook } from "@testing-library/react";
import { createUseCompleteAuthentication } from "./useCompleteAuthentication.factory";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const dependencies = {
  clearAnonymousCalendarChangeSignUpPrompt: mock(),
  markUserAsAuthenticated: mock(),
  onEventSourceChanged: mock(),
  refreshUserMetadata: mock(),
  syncPendingLocalEvents: mock(),
  useSession: mock(),
};

describe("useCompleteAuthentication", () => {
  const setAuthenticated = mock();

  beforeEach(() => {
    setAuthenticated.mockClear();

    dependencies.clearAnonymousCalendarChangeSignUpPrompt.mockClear();
    dependencies.markUserAsAuthenticated.mockClear();
    dependencies.onEventSourceChanged.mockClear();
    dependencies.refreshUserMetadata.mockClear();
    dependencies.syncPendingLocalEvents.mockClear();
    dependencies.useSession.mockClear();

    dependencies.useSession.mockReturnValue({
      authenticated: false,
      setAuthenticated,
    });
    dependencies.refreshUserMetadata.mockResolvedValue(true);
    dependencies.syncPendingLocalEvents.mockResolvedValue(true);
  });

  it("marks the user authenticated and triggers an event fetch", async () => {
    const useCompleteAuthentication =
      createUseCompleteAuthentication(dependencies);
    const onComplete = mock();
    const { result } = renderHook(() => useCompleteAuthentication());

    await result.current({ email: "test@example.com", onComplete });

    expect(
      dependencies.clearAnonymousCalendarChangeSignUpPrompt,
    ).toHaveBeenCalled();
    expect(dependencies.markUserAsAuthenticated).toHaveBeenCalledWith(
      "test@example.com",
    );
    expect(setAuthenticated).toHaveBeenCalledWith(true);
    expect(dependencies.refreshUserMetadata).toHaveBeenCalled();
    expect(dependencies.syncPendingLocalEvents).toHaveBeenCalled();
    expect(dependencies.onEventSourceChanged).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it("waits for pending local event sync before completing", async () => {
    const useCompleteAuthentication =
      createUseCompleteAuthentication(dependencies);
    const onComplete = mock();
    const { result } = renderHook(() => useCompleteAuthentication());

    let resolveSync: (value: boolean) => void = () => {};
    dependencies.syncPendingLocalEvents.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSync = resolve;
      }),
    );

    const completion = result.current({ onComplete });

    await Promise.resolve();

    expect(onComplete).not.toHaveBeenCalled();

    resolveSync(true);
    await completion;

    expect(onComplete).toHaveBeenCalled();
  });
});
