import {
  createGetEventRepository,
  createGetEventRepositorySource,
} from "./event.repository.factory";
import { loadEventRepositoryBySource } from "./event.repository.util";
import { LocalEventRepository } from "./local.event.repository";
import { RemoteEventRepository } from "./remote.event.repository";
import { beforeEach, describe, expect, it } from "bun:test";

describe("getEventRepositorySource", () => {
  let hasUserEverAuthenticated = false;

  const getEventRepositorySource = createGetEventRepositorySource({
    hasUserEverAuthenticated: () => hasUserEverAuthenticated,
  });

  beforeEach(() => {
    hasUserEverAuthenticated = false;
  });

  it("returns 'remote' when a session exists", () => {
    expect(getEventRepositorySource(true)).toBe("remote");
  });

  it("returns 'local' when no session exists", () => {
    expect(getEventRepositorySource(false)).toBe("local");
  });

  it("returns 'remote' when a returning user has no active session", () => {
    hasUserEverAuthenticated = true;

    expect(getEventRepositorySource(false)).toBe("remote");
  });

  it("keeps authenticated users on remote regardless of local storage availability", () => {
    hasUserEverAuthenticated = true;

    // Source is derived from auth/session only. IndexedDB init failure is
    // not an input, so a signed-in user never falls back to an empty local
    // calendar when offline storage is blocked.
    expect(getEventRepositorySource(true)).toBe("remote");
    expect(getEventRepositorySource(false)).toBe("remote");
  });
});

describe("getEventRepository", () => {
  let hasUserEverAuthenticated = false;

  const getEventRepository = createGetEventRepository({
    createLocalEventRepository: () => new LocalEventRepository(),
    createRemoteEventRepository: () => new RemoteEventRepository(),
    hasUserEverAuthenticated: () => hasUserEverAuthenticated,
  });

  beforeEach(() => {
    hasUserEverAuthenticated = false;
  });

  it("uses remote storage when a session exists", () => {
    expect(getEventRepository(true)).toBeInstanceOf(RemoteEventRepository);
  });

  it("uses local storage when no session exists", () => {
    expect(getEventRepository(false)).toBeInstanceOf(LocalEventRepository);
  });

  it("uses remote storage when a returning user has no active session", () => {
    hasUserEverAuthenticated = true;

    expect(getEventRepository(false)).toBeInstanceOf(RemoteEventRepository);
  });
});

describe("loadEventRepositoryBySource", () => {
  it("loads the remote repository without constructing local storage", async () => {
    const repository = await loadEventRepositoryBySource("remote");
    expect(repository).toBeInstanceOf(RemoteEventRepository);
  });

  it("loads the local repository when the source is local", async () => {
    const repository = await loadEventRepositoryBySource("local");
    expect(repository).toBeInstanceOf(LocalEventRepository);
  });
});
