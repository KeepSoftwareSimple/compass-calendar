import { ObjectId } from "mongodb";

/** Compass ids are ObjectId-shaped strings; Mongo filters use BSON ObjectId. */
export const mongoObjectId = (id: string): ObjectId => new ObjectId(id);
