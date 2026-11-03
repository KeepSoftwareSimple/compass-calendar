import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { UserApi } from "@web/api/user.api";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { useLifePreferences } from "@web/views/Life/useLifePreferences";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const settings = {
  birthDate: "1990-02-03",
  lifespan: 85,
  variation: "average" as const,
};
afterEach(() => {
  mock.restore();
  localStorage.removeItem(STORAGE_KEYS.LIFE_PREFERENCES);
  localStorage.removeItem("compass.life.migrated-account");
});

describe("account life preferences", () => {
  it("uses database settings without overwriting them from the browser", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LIFE_PREFERENCES,
      JSON.stringify({ ...settings, lifespan: 100 }),
    );
    spyOn(UserApi, "getLifePreferences").mockResolvedValue({
      preferences: settings,
      revision: 2,
    });
    const save = spyOn(UserApi, "saveLifePreferences");
    const { result } = renderHook(() => useLifePreferences(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <UserContext.Provider value={{ userId: "a" }}>
          {children}
        </UserContext.Provider>
      ),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(settings);
    expect(save).not.toHaveBeenCalled();
  });

  it("does not migrate the placeholder birthday or migrate the first account's browser data into a second account", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LIFE_PREFERENCES,
      JSON.stringify({ ...settings, birthDate: "2000-01-01" }),
    );
    spyOn(UserApi, "getLifePreferences").mockResolvedValue({
      preferences: null,
      revision: 0,
    });
    const save = spyOn(UserApi, "saveLifePreferences").mockResolvedValue({
      preferences: { ...settings, birthDate: "" },
      revision: 1,
    });
    let userId = "a";
    const { result, rerender } = renderHook(() => useLifePreferences(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <UserContext.Provider value={{ userId }}>
          {children}
        </UserContext.Provider>
      ),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(save).toHaveBeenCalledWith({
      preferences: { ...settings, birthDate: "" },
      expectedRevision: null,
    });
    userId = "b";
    rerender();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.preferences.birthDate).toBe("");
  });

  it("reloads after a conflicting save rather than silently overwriting a newer device", async () => {
    const get = spyOn(UserApi, "getLifePreferences").mockResolvedValue({
      preferences: settings,
      revision: 2,
    });
    spyOn(UserApi, "saveLifePreferences").mockRejectedValue(
      new Error("conflict"),
    );
    const { result } = renderHook(() => useLifePreferences(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <UserContext.Provider value={{ userId: "a" }}>
          {children}
        </UserContext.Provider>
      ),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    get.mockResolvedValue({
      preferences: { ...settings, lifespan: 90 },
      revision: 3,
    });
    act(() =>
      result.current.setPreferences((value) => ({ ...value, lifespan: 100 })),
    );
    await waitFor(() => expect(result.current.error).toContain("not saved"));
    expect(result.current.preferences.lifespan).toBe(90);
  });
});
