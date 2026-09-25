import { NodeEnv } from "@core/constants/core.constants";

export const isDev = (nodeEnv: NodeEnv | string) =>
  nodeEnv === NodeEnv.Development;

/** True when `nodeEnv` is not production. */
export const isNonProduction = (nodeEnv: NodeEnv | string) =>
  nodeEnv !== NodeEnv.Production;

/** Booking v1 is on in every runtime environment, including production. */
export const isBookingEnabled = (_nodeEnv: NodeEnv | string) => true;

/**
 * Microsoft sign-in and connect stay off in production until publisher
 * verification lands. Staging, local, and tests can still offer it.
 */
export const isMicrosoftOffered = (nodeEnv: NodeEnv | string) =>
  isNonProduction(nodeEnv);
