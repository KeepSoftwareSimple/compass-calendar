import { ObjectId } from "bson";
import { z as zod4 } from "zod/v4";
import { z as zod4Mini } from "zod/v4-mini";

/** Zod schema that yields a bson ObjectId. Server/Mongo only; do not import from web. */
export const zObjectIdMini = zod4Mini.pipe(
  zod4Mini.custom<ObjectId | string>(ObjectId.isValid),
  zod4Mini.transform((v) => new ObjectId(v)),
);

/** Zod schema that yields a bson ObjectId. Server/Mongo only; do not import from web. */
export const zObjectId = zod4.pipe(
  zod4.custom<ObjectId | string>((v) => ObjectId.isValid(v as string)),
  zod4.transform((v) => new ObjectId(v)),
);
