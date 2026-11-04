import { useContext, useEffect, useId, useRef, useState } from "react";
import { type z } from "zod/v4";
import { type ReflectionPreferencesResponseSchema } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";

export function ReflectionPreferencesControl() {
  const userId = useContext(UserContext)?.userId;
  const descriptionId = useId();
  const errorId = useId();
  const session = useRef(0);
  const [state, setState] = useState<{
    userId: string;
    data: z.infer<typeof ReflectionPreferencesResponseSchema>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    session.current++;
    setSaving(false);
    setError("");
    if (userId)
      void UserApi.getReflectionPreferences()
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
  }, [userId]);
  if (!userId || state?.userId !== userId || !state.data.available) return null;
  const preferences = state.data.preferences;
  const change = async (enabled: boolean) => {
    const generation = session.current;
    setSaving(true);
    setError("");
    try {
      const data = await UserApi.saveReflectionPreferences({
        enabled,
        timeZone:
          preferences?.timeZone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        excludedCalendarIds: [...readHiddenCalendarIds()],
      });
      if (generation === session.current) setState({ userId, data });
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
          disabled={saving}
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
      <p>
        Recent highlights, memories, your life in weeks, and time to plan ahead.
      </p>
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
