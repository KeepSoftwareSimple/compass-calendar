import { HttpResponse, type JsonBodyType } from "msw";
import { Status } from "@core/errors/status.codes";

/** MSW v2 helper matching common v1 `res(ctx.status(...), ctx.json(...))` shapes. */
export function jsonResponse(body: JsonBodyType, status: number = Status.OK) {
  return HttpResponse.json(body, { status });
}
