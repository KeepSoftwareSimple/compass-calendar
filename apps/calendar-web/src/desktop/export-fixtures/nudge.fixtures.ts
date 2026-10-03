import { ensureDesktopExportEnv } from "@core/desktop/desktop-export-env";
import { repositionDraftByKeyboard } from "@web/common/utils/draft/reposition-draft-by-keyboard.util";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";

export const buildNudgeFixtures = () => {
  ensureDesktopExportEnv();
  setPinnedTimeZone("UTC");

  const draft = createGridEventDraft(
    timedGridSchedule(
      new Date("2026-05-20T09:00:00.000Z"),
      new Date("2026-05-20T10:00:00.000Z"),
    ),
  );

  const moved = repositionDraftByKeyboard({
    activity: "createShortcut",
    draft,
    key: "ArrowDown",
  });

  const rejected = repositionDraftByKeyboard({
    activity: "eventRightClick",
    draft,
    key: "ArrowDown",
  });

  return {
    cases: [
      {
        id: "arrow-down-create-shortcut",
        input: {
          activity: "createShortcut",
          key: "ArrowDown",
          schedule: {
            start: draft.values.schedule.start.toISOString(),
            end: draft.values.schedule.end.toISOString(),
            kind: draft.values.schedule.kind,
          },
        },
        output: moved
          ? {
              schedule: {
                start: moved.values.schedule.start.toISOString(),
                end: moved.values.schedule.end.toISOString(),
                kind: moved.values.schedule.kind,
              },
            }
          : null,
      },
      {
        id: "non-repositionable-activity",
        input: {
          activity: "eventRightClick",
          key: "ArrowDown",
        },
        output: rejected,
      },
      {
        id: "blocked-by-range",
        input: {
          activity: "createShortcut",
          key: "ArrowRight",
          isStartAllowed: false,
        },
        output: repositionDraftByKeyboard({
          activity: "createShortcut",
          draft,
          key: "ArrowRight",
          isStartAllowed: () => false,
        }),
      },
    ],
  };
};

export const emitNudgeFixturesJson = (): string =>
  `${JSON.stringify(buildNudgeFixtures(), null, 2)}\n`;
