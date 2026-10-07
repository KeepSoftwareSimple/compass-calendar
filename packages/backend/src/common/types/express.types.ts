import { type Request, type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionRequest["session"];
  }

  interface Response {
    promise: (p: Promise<unknown> | (() => unknown) | unknown) => Response;
  }
}

export interface ReqBody<T> extends Request {
  body: T;
}

export type Res_Promise = Response;

export interface SReqBody<T> extends SessionRequest {
  body: T;
}

export interface SessionResponse extends Response {
  req: SessionRequest;
}
