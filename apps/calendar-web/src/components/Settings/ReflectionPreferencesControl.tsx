import { useContext, useEffect, useId, useRef, useState } from "react";
import { type z } from "zod/v4";
import { type ReflectionPreferencesResponseSchema } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export function ReflectionPreferencesControl() {
  const account = useContext(UserContext);
  const { authenticated } = useSession();
  const userId = authenticated ? account?.userId : undefined;
  const timeZone = useEffectiveTimeZone();
  const descriptionId = useId();
  const errorId = useId();
  const session = useRef(0);
  const [state, setState] = useState<{
    userId: string;
    data: z.infer<typeof ReflectionPreferencesResponseSchema>;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    session.current++;
    setSaving(false);
    setPaused(false);
    setError("");
    if (userId)
      void UserApi.initializeReflectionPreferences({
        timeZone,
        excludedCalendarIds: [...readHiddenCalendarIds()],
      })
        .then(() => UserApi.getReflectionPreferences())
        .then((data) => {
          if (active) setState({ userId, data });
        })
        .catch(() => {
          if (active) setError("Reflection settings could not be loaded.");
        });
    return () => {
      active = false;
      session.current++;
    };
  }, [userId, timeZone]);
  if (!userId) return <p>Sign in to manage calendar reflection emails.</p>;
  if (state?.userId !== userId)
    return (
      <p role={error ? "alert" : "status"}>
        {error || "Loading reflection settings…"}
      </p>
    );
  if (!state.data.available && !state.data.preferences)
    return <p>Calendar reflections are not available for this account yet.</p>;
  const preferences = state.data.preferences;
  const change = async (
    enabled: boolean,
    reviewTimeZone = preferences?.timeZone ?? timeZone,
  ) => {
    const generation = session.current;
    setSaving(true);
    setError("");
    try {
      const data = await UserApi.saveReflectionPreferences({
        enabled,
        timeZone: reviewTimeZone,
        excludedCalendarIds: preferences?.excludedCalendarIds ?? [
          ...readHiddenCalendarIds(),
        ],
      });
      if (generation === session.current) {
        setState({ userId, data });
        setPaused(preferences?.enabled === true && !enabled);
      }
    } catch {
      if (generation === session.current)
        setError(
          "Reflection settings were not saved. Your calendar history may still be preparing. Please try again.",
        );
    } finally {
      if (generation === session.current) setSaving(false);
    }
  };
  return (
    <section
      aria-label="Calendar reflections"
      className="flex flex-col gap-2 text-text-muted"
    >
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={preferences?.enabled ?? false}
          disabled={saving || (!state.data.available && !preferences?.enabled)}
          aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
          onChange={(event) => void change(event.target.checked)}
          className="accent-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        Email me calendar reflections
      </label>
      <p id={descriptionId}>
        {state.data.trial
          ? "Daily trial at 10:30 a.m."
          : "Sundays at 10:30 a.m."}{" "}
        (
        {preferences?.timeZone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone}
        )
      </p>
      {preferences && preferences.timeZone !== timeZone && (
        <button
          className="c-focus-ring self-start text-accent underline"
          type="button"
          disabled={saving || !state.data.available}
          onClick={() => void change(preferences.enabled, timeZone)}
        >
          Use app timezone ({timeZone})
        </button>
      )}
      <p>
        Recent highlights, memories, your life in weeks, and time to plan ahead.
      </p>
      {paused && (
        <p role="status">
          Calendar reflections are paused. You can enable them here anytime.{" "}
          <a
            className="c-focus-ring text-accent underline"
            href="mailto:tyler@keepsoftwaresimple.com?subject=Calendar%20reflection%20feedback"
          >
            Share feedback by email (optional)
          </a>
        </p>
      )}
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
