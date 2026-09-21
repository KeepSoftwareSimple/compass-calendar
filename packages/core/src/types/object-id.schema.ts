import { ObjectId } from "bson";
import { z as zod4 } from "zod/v4";

export const zObjectId = zod4.pipe(
  zod4.custom<ObjectId | string>((v) => ObjectId.isValid(v as string)),
  zod4.transform((v) => new ObjectId(v)),
);
