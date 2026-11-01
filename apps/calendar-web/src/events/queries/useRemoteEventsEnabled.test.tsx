import { act, renderHook } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  resetAuthSessionStoreForTests,
  setSessionResolved,
} from "@web/auth/compass/session/auth-session.store";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { useRemoteEventsAwaitingSignIn } from "@web/events/queries/useRemoteEventsEnabled";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { afterEach, describe, expect, it } from "bun:test";

const renderAwaiting = (
  source: EventRepositorySource,
  authenticated: boolean,
) =>
  renderHook(() => useRemoteEventsAwaitingSignIn(source), {
    wrapper: ({ children }: PropsWithChildren) => (
      <SessionContext.Provider
        value={{ authenticated, setAuthenticated: () => {} }}
      >
        {children}
      </SessionContext.Provider>
    ),
  });

describe("useRemoteEventsAwaitingSignIn", () => {
  afterEach(() => {
    resetAuthSessionStoreForTests();
  });

  it("waits on sign-in once a returning visitor's session check finds none (#5033)", () => {
    const { result } = renderAwaiting("remote", false);
    expect(result.current).toBe(false);

    act(() => setSessionResolved(true));

    expect(result.current).toBe(true);
  });

  it("keeps the loader while the session check is still in flight", () => {
    const { result } = renderAwaiting("remote", false);

    expect(result.current).toBe(false);
  });

  it("does not wait for a signed-in user", () => {
    setSessionResolved(true);
    const { result } = renderAwaiting("remote", true);

    expect(result.current).toBe(false);
  });

  it("never waits for local reads", () => {
    setSessionResolved(true);
    const { result } = renderAwaiting("local", false);

    expect(result.current).toBe(false);
  });
});
