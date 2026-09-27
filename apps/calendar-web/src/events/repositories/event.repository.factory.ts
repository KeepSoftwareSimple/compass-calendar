import { type EventRepository } from "./event.repository.types";

export type EventRepositorySource = "local" | "remote";

type EventRepositoryDependencies = {
  createLocalEventRepository: () => EventRepository;
  createRemoteEventRepository: () => EventRepository;
  hasUserEverAuthenticated: () => boolean;
};

export function createGetEventRepositorySource({
  hasUserEverAuthenticated,
}: Omit<
  EventRepositoryDependencies,
  "createLocalEventRepository" | "createRemoteEventRepository"
>) {
  return function getEventRepositorySource(
    sessionExists: boolean,
  ): EventRepositorySource {
    if (hasUserEverAuthenticated()) {
      return "remote";
    }

    if (sessionExists) {
      return "remote";
    }

    return "local";
  };
}

export function createGetEventRepositoryBySource({
  createLocalEventRepository,
  createRemoteEventRepository,
}: Pick<
  EventRepositoryDependencies,
  "createLocalEventRepository" | "createRemoteEventRepository"
>) {
  return function getEventRepositoryBySource(
    source: EventRepositorySource,
  ): EventRepository {
    return source === "remote"
      ? createRemoteEventRepository()
      : createLocalEventRepository();
  };
}

export function createGetEventRepository({
  createLocalEventRepository,
  createRemoteEventRepository,
  hasUserEverAuthenticated,
}: EventRepositoryDependencies) {
  const getEventRepositorySource = createGetEventRepositorySource({
    hasUserEverAuthenticated,
  });
  const getEventRepositoryBySource = createGetEventRepositoryBySource({
    createLocalEventRepository,
    createRemoteEventRepository,
  });

  return function getEventRepository(sessionExists: boolean): EventRepository {
    return getEventRepositoryBySource(getEventRepositorySource(sessionExists));
  };
}
