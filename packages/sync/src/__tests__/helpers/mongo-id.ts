import { type Document, type Filter, ObjectId } from "mongodb";

/** Compass ids are ObjectId-shaped strings; Mongo filters use BSON ObjectId. */
export const mongoObjectId = (id: string): ObjectId => new ObjectId(id);

/** Collections that persist `_id` as a hex string (most sync records). */
export const stringIdFilter = (id: string): Filter<Document> =>
  ({ _id: id }) as unknown as Filter<Document>;
