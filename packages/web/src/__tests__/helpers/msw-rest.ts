/**
 * MSW v1-style `rest` handlers for tests, implemented with MSW v2 `http`.
 * Keeps existing test bodies unchanged while the app runs on msw@2.
 */

import {
  type DefaultBodyType,
  delay,
  HttpResponse,
  http,
  type PathParams,
} from "msw";

type MswPart =
  | { __msw: "status"; code: number }
  | { __msw: "json"; body: unknown }
  | { __msw: "text"; body: string }
  | { __msw: "set"; key: string; value: string }
  | { __msw: "cookie"; name: string; value: string }
  | { __msw: "delay"; ms: number };

type RestRequest = {
  json: () => Promise<unknown>;
  params: PathParams;
  url: URL;
};

type RestContext = {
  status: (code: number) => MswPart;
  json: (body: unknown) => MswPart;
  text: (body: string) => MswPart;
  set: (key: string, value: string) => MswPart;
  cookie: (name: string, value: string) => MswPart;
  delay: (ms: number) => MswPart;
};

type RestResolver = (
  req: RestRequest,
  res: (...parts: MswPart[]) => Promise<HttpResponse<DefaultBodyType>>,
  ctx: RestContext,
) =>
  | HttpResponse<DefaultBodyType>
  | Promise<HttpResponse<DefaultBodyType>>
  | Promise<void>
  | void;

const ctx: RestContext = {
  status: (code) => ({ __msw: "status", code }),
  json: (body) => ({ __msw: "json", body }),
  text: (body) => ({ __msw: "text", body }),
  set: (key, value) => ({ __msw: "set", key, value }),
  cookie: (name, value) => ({ __msw: "cookie", name, value }),
  delay: (ms) => ({ __msw: "delay", ms }),
};

async function partsToResponse(
  parts: MswPart[],
): Promise<HttpResponse<DefaultBodyType>> {
  let status = 200;
  let body: unknown;
  let textBody: string | undefined;
  const headers = new Headers();
  const cookies: string[] = [];
  let delayMs: number | undefined;

  for (const part of parts) {
    switch (part.__msw) {
      case "status":
        status = part.code;
        break;
      case "json":
        body = part.body;
        break;
      case "text":
        textBody = part.body;
        break;
      case "set":
        headers.set(part.key, part.value);
        break;
      case "cookie":
        cookies.push(`${part.name}=${part.value}`);
        break;
      case "delay":
        delayMs = part.ms;
        break;
      default:
        break;
    }
  }

  if (delayMs !== undefined) {
    await delay(delayMs);
  }

  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  if (textBody !== undefined) {
    return new HttpResponse(textBody, { status, headers });
  }

  return HttpResponse.json(body ?? null, { status, headers });
}

async function res(
  ...parts: MswPart[]
): Promise<HttpResponse<DefaultBodyType>> {
  return partsToResponse(parts);
}

function createRestMethod(method: keyof typeof http) {
  return (path: string, resolver: RestResolver) => {
    const handler = http[method];
    return handler(path, async ({ request, params }) => {
      const req: RestRequest = {
        json: () => request.json(),
        params,
        url: new URL(request.url),
      };
      const result = await resolver(req, res, ctx);
      if (result instanceof HttpResponse) {
        return result;
      }
      throw new Error(
        `MSW rest handler for ${String(method).toUpperCase()} ${path} must return res(...)`,
      );
    });
  };
}

export const rest = {
  get: createRestMethod("get"),
  post: createRestMethod("post"),
  put: createRestMethod("put"),
  delete: createRestMethod("delete"),
  patch: createRestMethod("patch"),
  options: createRestMethod("options"),
};
