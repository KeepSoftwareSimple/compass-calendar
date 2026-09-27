import { z } from "zod/v4";
import { EventSchema } from "@core/types/event.contracts";

// There is no syncState field: promotion deletes each row after a successful
// create, then clears leftovers (demos). A richer per-record state machine
// is not required for resume safety.
export const LocalEventRecordSchema = z
  .strictObject({
    version: z.literal(2),
    id: EventSchema.shape.id,
    event: EventSchema,
    isDemo: z.boolean(),
    // Occurrence starts excluded from a locally-stored series ("delete this
    // occurrence" in anonymous mode). Honored by read-time expansion only;
    // sign-in promotion does not carry exclusions to the server.
    exdates: z.array(z.string()).optional(),
  })
  // IndexedDB keys on the duplicated top-level id, so it must always match
  // the nested event's own id.
  .refine(({ id, event }) => id === event.id, {
    message: "Top-level id must match event.id",
    path: ["id"],
  });
export type LocalEventRecord = z.infer<typeof LocalEventRecordSchema>;
