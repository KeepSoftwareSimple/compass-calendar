import { APP_NAME } from "@core/constants/core.constants";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { CompassEventSchema } from "@core/types/compass-event.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { composeOccurrenceId } from "@core/util/occurrence-id";

export const probe = {
  APP_NAME,
  YEAR_MONTH_DAY_FORMAT,
  EventIdSchema,
  CompassEventSchema,
  composeOccurrenceId,
};
