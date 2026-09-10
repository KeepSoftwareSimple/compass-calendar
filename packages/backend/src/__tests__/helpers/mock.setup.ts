import { type NextFunction, type Response } from "express";
import superTokensNode from "supertokens-node";
import { type SessionRequest } from "supertokens-node/framework/express";
import {
  type SessionContainerInterface,
  type VerifySessionOptions,
} from "supertokens-node/lib/build/recipe/session/types";
import { Status } from "@core/errors/status.codes";
import {
  type LoggerFactoryFn,
  registerLoggerFactory,
  resetLoggerFactory,
} from "@core/logger/logger.factory";
import { StringV4Schema, zObjectId } from "@core/types/type.utils";
import { getTestIsolationKey } from "@backend/__tests__/helpers/test-file-context";
import {
  registerUserIdMappingStore,
  registerUserMetadataStore,
  resetSupertokensStores,
} from "@backend/auth/ports/supertokens.registry";
import {
  createInMemoryUserIdMappingStore,
  createInMemoryUserMetadataStore,
  type UserIdMappingStore,
  type UserMetadataStore,
} from "@backend/auth/ports/supertokens.stores";
import {
  registerTestVerifySession,
  resetVerifySession,
} from "@backend/auth/session/session.middleware";
import { CONFIG } from "@backend/common/constants/config.constants";
import { type SupertokensAccessTokenPayload } from "@backend/common/types/supertokens.types";
import { sseServer } from "@backend/servers/sse/sse.server";
import userService from "@backend/user/services/user.service";
import { afterAll, afterEach, beforeEach, mock, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";

const fixturesByFile = new Map<
  string,
  { metadata: UserMetadataStore; mappings: UserIdMappingStore }
>();

function getFileSupertokensStores(): {
  metadata: UserMetadataStore;
  mappings: UserIdMappingStore;
} {
  const key = getTestIsolationKey();
  let stores = fixturesByFile.get(key);
  if (!stores) {
    stores = {
      metadata: createInMemoryUserMetadataStore(),
      mappings: createInMemoryUserIdMappingStore(),
    };
    fixturesByFile.set(key, stores);
  }
  return stores;
}

/** Stands in for SessionContainer.revokeSession in tests. */
export const revokeSessionMock = mock(async () => {});

function createTestVerifySession(): ReturnType<
  typeof import("supertokens-node/recipe/session/framework/express").verifySession
> {
  const factory = (_options?: VerifySessionOptions) => {
    return (req: SessionRequest, res: Response, next?: NextFunction) => {
      try {
        const cookies = (req.headers.cookie?.split(";") ?? [])?.reduce(
          (items, item) => {
            const [key, value] = item.split("=");
            if (typeof key === "string") items[key] = value;
            return items;
          },
          {} as Record<string, string | undefined>,
        );

        const sessionString = cookies["session"];
        if (typeof sessionString !== "string") {
          res.status(Status.UNAUTHORIZED).json({ message: "Session required" });
          return;
        }
        const now = new Date();
        const tId = randomUUID();
        const sessionHandle = randomUUID();

        const session: { userId: string; sessionId?: string } | undefined =
          typeof sessionString === "string"
            ? JSON.parse(sessionString)
            : undefined;

        const userId = zObjectId.parse(session?.userId, {
          error: () => "invalid superToken session",
        });

        const sessionId = StringV4Schema.parse(
          session?.sessionId ?? sessionHandle,
          { error: () => "invalid superToken session" },
        );

        req.session = {
          getUserId() {
            return userId.toString();
          },
          getHandle() {
            return sessionId;
          },
          revokeSession: revokeSessionMock,
          getAccessTokenPayload(): SupertokensAccessTokenPayload {
            return {
              iat: now.getMilliseconds(),
              exp: now.getMilliseconds() + 5000,
              iss: req.headers.origin ?? "http://localhost",
              sub: userId.toString(),
              rsub: userId.toString(),
              tId,
              sessionHandle: sessionId,
              refreshTokenHash1: null,
              parentRefreshTokenHash1: null,
              antiCsrfToken: null,
            };
          },
        } as unknown as SessionContainerInterface;

        return next?.();
      } catch (error) {
        if (next) {
          next(error);
        } else {
          throw error;
        }
      }
    };
  };
  return factory as unknown as ReturnType<
    typeof import("supertokens-node/recipe/session/framework/express").verifySession
  >;
}

const testLoggers = new Map<string, Record<string, ReturnType<typeof mock>>>();

function clearTestLoggerMocks(): void {
  for (const logger of testLoggers.values()) {
    for (const method of Object.values(logger)) {
      method.mockClear();
    }
  }
}

function registerTestLoggerFactory(): void {
  const factory: LoggerFactoryFn = (name?: string) => {
    const key = name ?? "";
    const existing = testLoggers.get(key);
    if (existing) return existing as unknown as ReturnType<LoggerFactoryFn>;

    const logger = {
      debug: mock(),
      info: mock(),
      warn: mock(),
      error: mock(),
      verbose: mock(),
    };
    testLoggers.set(key, logger);
    return logger as unknown as ReturnType<LoggerFactoryFn>;
  };

  registerLoggerFactory(factory);
}

const configBaseline = Object.fromEntries(
  Object.entries(CONFIG).map(([key, value]) => [key, value]),
) as typeof CONFIG;

let fileScopeEnv: Partial<typeof CONFIG> = {};
let testScopeEnv: Partial<typeof CONFIG> = {};
let insideTest = false;

function restoreConfigBaseline(): void {
  for (const [key, value] of Object.entries(configBaseline)) {
    Object.defineProperty(CONFIG, key, {
      configurable: true,
      enumerable: true,
      value,
    });
  }
}

function applyConfigOverrides(env: Partial<typeof CONFIG>): void {
  for (const [key, value] of Object.entries(env)) {
    Object.defineProperty(CONFIG, key, {
      configurable: true,
      enumerable: true,
      value,
    });
  }
}

function applyMergedConfigOverrides(): void {
  restoreConfigBaseline();
  applyConfigOverrides({ ...fileScopeEnv, ...testScopeEnv });
}

export function mockEnv(env: Partial<typeof CONFIG>) {
  const isTestScope = insideTest;
  if (isTestScope) {
    testScopeEnv = { ...testScopeEnv, ...env };
  } else {
    fileScopeEnv = { ...fileScopeEnv, ...env };
  }
  applyConfigOverrides(env);

  return {
    [Symbol.dispose]: () => {
      const scope = isTestScope ? testScopeEnv : fileScopeEnv;
      for (const key of Object.keys(env)) {
        delete scope[key as keyof typeof CONFIG];
      }
      applyMergedConfigOverrides();
    },
  };
}

function restoreMockedMethods(...targets: object[]): void {
  for (const target of targets) {
    for (const key of Object.getOwnPropertyNames(target)) {
      const value = (target as Record<string, unknown>)[key];
      if (
        typeof value === "function" &&
        "mockRestore" in value &&
        typeof (value as { mockRestore?: () => void }).mockRestore ===
          "function"
      ) {
        (value as { mockRestore: () => void }).mockRestore();
      }
    }
  }
}

/** Clears per-test spies so sequential cases in a file do not leak call counts. */
function restoreLeakedTestSpies(): void {
  restoreMockedMethods(sseServer, userService);
}

export function getTestLoggerInfoCalls(
  namespace = "",
): Array<[string, ...unknown[]]> {
  const logger = testLoggers.get(namespace);
  return (logger?.info.mock?.calls ?? []) as Array<[string, ...unknown[]]>;
}

export function setupBackendTestSeams(): void {
  restoreLeakedTestSpies();
  registerTestLoggerFactory();

  const { metadata, mappings } = getFileSupertokensStores();

  metadata.reset();
  mappings.reset();
  revokeSessionMock.mockClear();
  clearTestLoggerMocks();

  registerUserMetadataStore(metadata);
  registerUserIdMappingStore(mappings);
  registerTestVerifySession(
    createTestVerifySession() as Parameters<
      typeof registerTestVerifySession
    >[0],
  );
}

function applyPreloadSpies(): void {
  registerTestLoggerFactory();
  spyOn(superTokensNode, "init").mockImplementation(() => undefined);
  spyOn(superTokensNode, "getAllCORSHeaders").mockReturnValue([]);
}

/** Process-wide mock.restore() that keeps preload spies intact for parallel workers. */
export function restoreFileMocks(): void {
  mock.restore();
  applyPreloadSpies();
}

export function mockNodeModules() {
  applyPreloadSpies();

  beforeEach(() => {
    setupBackendTestSeams();
    insideTest = true;
    applyMergedConfigOverrides();
  });

  afterEach(() => {
    insideTest = false;
    testScopeEnv = {};
    applyMergedConfigOverrides();
  });

  afterAll(() => {
    fileScopeEnv = {};
    testScopeEnv = {};
    restoreConfigBaseline();
  });
}

export function teardownBackendTestSeams(): void {
  resetLoggerFactory();
  resetSupertokensStores();
  resetVerifySession();
}
