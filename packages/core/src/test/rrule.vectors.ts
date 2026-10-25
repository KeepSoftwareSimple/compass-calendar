import { ObjectId } from "bson";
import {
  RRULE_VECTOR_INPUTS,
  type RruleVectorInput,
} from "@core/test/rrule.vectors.data";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { createMockBaseEvent } from "@core/util/test/ccal.event.factory";

const FIXED_EVENT_ID = new ObjectId("507f1f77bcf86cd799439011");

export type RruleVectorCase = {
  id: string;
  input: {
    startDate: string;
    endDate: string;
    recurrenceRule: string;
    timeZone: string;
    firstN: number;
  };
  output: {
    summary: string;
    instances: string[];
  };
};

export const buildRruleVectorCase = ({
  id,
  startDate,
  endDate,
  recurrenceRule,
  timeZone,
  firstN,
}: RruleVectorInput): RruleVectorCase => {
  const base = createMockBaseEvent(
    {
      _id: FIXED_EVENT_ID.toString(),
      startDate,
      recurrence: { rule: [recurrenceRule] },
    },
    false,
    { value: 1, unit: "hour" },
  );
  const rrule = new CompassEventRRule(
    {
      ...base,
      _id: FIXED_EVENT_ID,
    },
    { tzid: timeZone },
  );

  return {
    id,
    input: {
      startDate,
      endDate,
      recurrenceRule,
      timeZone,
      firstN,
    },
    output: {
      summary: rrule.toString(),
      instances: rrule
        .all((_, index) => index < firstN)
        .map((date) => date.toISOString()),
    },
  };
};

export const buildRruleFixtures = () => ({
  cases: RRULE_VECTOR_INPUTS.map((vector) => buildRruleVectorCase(vector)),
});

export const emitRruleFixturesJson = (): string =>
  `${JSON.stringify(buildRruleFixtures(), null, 2)}\n`;
