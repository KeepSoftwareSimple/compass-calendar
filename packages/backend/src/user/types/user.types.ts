import { type UserMetadata } from "@core/types/user.types";

export type GetUserMetadataResponse = {
  status: string;
  metadata: UserMetadata;
};

export interface Summary_Delete {
  calendars?: number;
  events?: number;
  hiddenEvents?: number;
  user?: number;
  sessions?: number;
  superTokensUsers?: number;
  superTokensMappings?: number;
  superTokensMetadata?: number;
}
