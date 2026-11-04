import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { type LifePreferencesResponse } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  DEFAULT_LIFE_PREFERENCES,
  hasLifePreferences,
  type LifePreferences,
  readAccountLifePreferences,
  readLifePreferences,
  writeAccountLifePreferences,
  writeLifePreferences,
} from "@web/views/Life/life-preferences.storage";

const MIGRATED_ACCOUNT = "compass.life.migrated-account";

export function useLifePreferences() {
  const userId = useContext(UserContext)?.userId;
  const [state, setState] = useState(() => ({
    userId,
    preferences: userId ? DEFAULT_LIFE_PREFERENCES : readLifePreferences(),
    ready: !userId,
    error: "",
  }));
  const current = useRef(state);
  current.current = state;
  const session = useRef(0);
  const saved = useRef<LifePreferencesResponse>({
    preferences: null,
    revision: 0,
  });
  const pending = useRef(Promise.resolve());

  const load = useCallback(async () => {
    const generation = ++session.current;
    setState({
      userId,
      preferences: DEFAULT_LIFE_PREFERENCES,
      ready: !userId,
      error: "",
    });
    if (!userId) {
      setState({
        userId,
        preferences: readLifePreferences(),
        ready: true,
        error: "",
      });
      return;
    }
    const cached = readAccountLifePreferences(userId);
    saved.current = cached ?? { preferences: null, revision: 0 };
    try {
      let result = await UserApi.getLifePreferences();
      if (session.current !== generation) return;
      const legacy = readLifePreferences();
      if (
        !result.preferences &&
        hasLifePreferences() &&
        !persistentBrowserStore.get(MIGRATED_ACCOUNT)
      ) {
        // The old default birthday is ambiguous and needs explicit confirmation.
        const preferences = {
          ...legacy,
          birthDate: legacy.birthDate === "2000-01-01" ? "" : legacy.birthDate,
        };
        result = await UserApi.saveLifePreferences({
          preferences,
          expectedRevision: null,
        });
      }
      if (session.current !== generation) return;
      persistentBrowserStore.set(MIGRATED_ACCOUNT, userId);
      saved.current = result;
      writeAccountLifePreferences(userId, result);
      setState({
        userId,
        preferences: result.preferences ?? DEFAULT_LIFE_PREFERENCES,
        ready: true,
        error: "",
      });
    } catch {
      if (session.current === generation)
        setState({
          userId,
          preferences: cached?.preferences ?? DEFAULT_LIFE_PREFERENCES,
          ready: !!cached,
          error: "Life settings could not be loaded. Please retry.",
        });
    }
  }, [userId]);

  useEffect(() => {
    void load();
    return () => {
      session.current++;
    };
  }, [load]);

  const update = useCallback(
    (transform: (value: LifePreferences) => LifePreferences) => {
      const previous = current.current;
      if (previous.userId !== userId || !previous.ready) return;
      const preferences = transform(previous.preferences);
      const next = { ...previous, preferences, error: "" };
      current.current = next;
      setState(next);
      if (!userId) {
        writeLifePreferences(preferences);
        return;
      }
      const generation = session.current;
      pending.current = pending.current.then(async () => {
        if (session.current !== generation) return;
        try {
          const result = await UserApi.saveLifePreferences({
            preferences,
            expectedRevision: saved.current.revision,
          });
          if (session.current === generation) {
            saved.current = result;
            writeAccountLifePreferences(userId, result);
          }
        } catch {
          // Stop queued writes on conflict/failure; reload the authoritative value.
          if (session.current !== generation) return;
          await load();
          setState((value) =>
            value.userId === userId
              ? {
                  ...value,
                  error:
                    "Life settings were not saved. Check the current values and try again.",
                }
              : value,
          );
        }
      });
    },
    [userId, load],
  );

  const matches = state.userId === userId;
  return {
    preferences: matches ? state.preferences : DEFAULT_LIFE_PREFERENCES,
    setPreferences: update,
    isLoading: !matches || !state.ready,
    error: matches ? state.error : "",
    retry: load,
  };
}
