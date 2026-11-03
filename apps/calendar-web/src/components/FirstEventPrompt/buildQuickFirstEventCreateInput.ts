import { type CalendarId, EventIdSchema } from "@core/types/domain-primitives";
import { type CreateEventInput } from "@core/types/event-command.contracts";
import { type Dayjs } from "@core/util/date/dayjs";
import { getDraftTimes } from "@web/common/utils/draft/draft.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { FIRST_EVENT_DEFAULT_TITLE } from "@web/components/FirstEventPrompt/first-event.constants";
import {
  createGridEventDraft,
  parseGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";

export function buildQuickFirstEventCreateInput(
  targetDay: Dayjs,
  calendarId: CalendarId,
): CreateEventInput | null {
  const { startDate, endDate } = getDraftTimes(targetDay);
  const clientId = EventIdSchema.parse(createObjectIdString());
  const draft = createGridEventDraft(
    timedGridSchedule(new Date(startDate), new Date(endDate)),
    clientId,
    calendarId,
  );
  draft.values.title = FIRST_EVENT_DEFAULT_TITLE;

  const parsed = parseGridEventDraft(draft);
  if (!parsed.ok || parsed.mode !== "create") return null;

  const id = parsed.input.id ?? clientId;
  return { ...parsed.input, id };
}
