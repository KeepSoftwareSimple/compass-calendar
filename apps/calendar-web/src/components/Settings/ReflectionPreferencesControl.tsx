import { useContext, useEffect, useId, useRef, useState } from "react";
import { type z } from "zod/v4";
import { type ReflectionPreferencesResponseSchema } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { isApiError } from "@web/api/util/api.util";
import { useSession } from "@web/auth/compass/session/useSession";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { usePostHog } from "@web/auth/posthog/posthog-react";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";
import { feedbackActions } from "@web/components/Feedback/feedback.store";
import { ReflectionEmailPreview } from "@web/components/Settings/ReflectionEmailPreview";
import {
  selectSettingsFocus,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export function ReflectionPreferencesControl() {
  const account = useContext(UserContext);
  const { authenticated } = useSession();
  const userId = authenticated ? account?.userId : undefined;
  const timeZone = useEffectiveTimeZone();
  const posthog = usePostHog();
  const descriptionId = useId();
  const scheduleId = useId();
  const errorId = useId();
  const session = useRef(0);
  const [state, setState] = useState<{
    userId: string;
    data: z.infer<typeof ReflectionPreferencesResponseSchema>;
  } | null>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const focusRequested =
    useSettingsStore(selectSettingsFocus) === "weekly-reflection";
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
  // An email link asked for this control: one keypress (Space) toggles it.
  const ready = state?.userId === userId;
  useEffect(() => {
    if (!focusRequested || !ready || !checkbox.current) return;
    checkbox.current.focus();
    settingsActions.clearSettingsFocus();
  }, [focusRequested, ready]);
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
  const deliveryTimeZone = preferences?.timeZone ?? timeZone;
  const change = async (
    enabled: boolean,
    reviewTimeZone = deliveryTimeZone,
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
      }
    } catch (caught) {
      const failed = isApiError(caught) ? caught.response : undefined;
      const message = (failed?.data as { message?: unknown } | undefined)
        ?.message;
      if (generation === session.current)
        setError(
          failed?.status === 403 && typeof message === "string"
            ? message
            : "Reflection settings were not saved. Please try again.",
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
      <label className="flex items-center gap-2 text-text">
        <input
          ref={checkbox}
          type="checkbox"
          checked={preferences?.enabled ?? false}
          disabled={saving || (!state.data.available && !preferences?.enabled)}
          aria-describedby={`${descriptionId} ${scheduleId}${error ? ` ${errorId}` : ""}`}
          onChange={(event) => void change(event.target.checked)}
          className="accent-accent focus-visible:outline-2 focus-visible:outline-accent"
        />
        Weekly reflection emails
      </label>
      <p id={descriptionId}>
        Highlights from previous years and your updated Life in Weeks as a PDF
      </p>
      <p id={scheduleId}>Sundays at 10:30 a.m. ({deliveryTimeZone})</p>
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
      <ReflectionEmailPreview />
      {saving ? (
        <p role="status">Saving…</p>
      ) : state.data.paused && !preferences?.enabled ? (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p role="status">Emails are paused.</p>
          {posthog && (
            <button
              type="button"
              className="c-focus-ring text-accent underline"
              onClick={() => feedbackActions.open("settings")}
            >
              Share feedback
            </button>
          )}
        </div>
      ) : null}
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
