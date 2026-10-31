import { type CalendarAccessRole } from "@core/types/sync/connection.contracts";
import { microsoftDiscoveredCalendarCapabilities } from "@sync/providers/microsoft/microsoft-calendar-capabilities";
import { resolveMicrosoftCalendarColor } from "@sync/providers/microsoft/microsoft-calendar-colors";
import {
  isMicrosoftTransient,
  microsoftFailureCause,
  microsoftStatus,
} from "@sync/providers/microsoft/microsoft-error";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import {
  MICROSOFT_CALENDAR_LIST_SELECT,
  MICROSOFT_GRAPH_BASE_URL,
} from "@sync/providers/microsoft/microsoft-http.constants";
import {
  defaultMicrosoftMasterCategoryApiFactory,
  listMicrosoftEventLabels,
  type MicrosoftMasterCategoryApiFactory,
} from "@sync/providers/microsoft/microsoft-master-categories";
import {
  type CalendarDiscovery,
  type DiscoveredCalendar,
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";

export interface MicrosoftGraphCalendar {
  readonly id?: string;
  readonly name?: string;
  readonly color?: string;
  readonly hexColor?: string;
  readonly canEdit?: boolean;
  readonly canShare?: boolean;
  readonly isDefaultCalendar?: boolean;
  readonly isRemovable?: boolean;
  readonly owner?: {
    readonly name?: string;
    readonly address?: string;
  };
}

export interface MicrosoftGraphCalendarGroup {
  readonly id?: string;
  readonly name?: string;
}

export interface MicrosoftCalendarListPage {
  readonly items: readonly MicrosoftGraphCalendar[];
  readonly nextLink: string | null;
}

export interface MicrosoftCalendarGroupListPage {
  readonly items: readonly MicrosoftGraphCalendarGroup[];
  readonly nextLink: string | null;
}

export interface MicrosoftCalendarListApi {
  listPage(params: { nextLink?: string }): Promise<MicrosoftCalendarListPage>;
  listCalendarGroupsPage(params: {
    nextLink?: string;
  }): Promise<MicrosoftCalendarGroupListPage>;
  listGroupCalendarsPage(
    groupId: string,
    params: { nextLink?: string },
  ): Promise<MicrosoftCalendarListPage>;
}

export type MicrosoftCalendarListApiFactory = (
  accessToken: string,
) => MicrosoftCalendarListApi;

const defaultApiFactory: MicrosoftCalendarListApiFactory = (accessToken) =>
  new FetchMicrosoftCalendarListApi(accessToken);

const calendarListQuery = `$select=${MICROSOFT_CALENDAR_LIST_SELECT}`;

// Microsoft Graph implementation of the calendar-discovery port. Lists every
// calendar group (/me/calendarGroups, then each group's calendars) with paging,
// deduping by id, and maps each row to provider-neutral facts. A plain
// /me/calendars read only covers the default group on many Outlook mailboxes,
// so secondary folders such as a user-created "Diet" calendar are missed unless
// groups are walked. Graph has no calendar-list delta token, so discovery
// always returns a null cursor and relies on periodic re-list sweeps for drift.
export class MicrosoftCalendarAdapter implements ProviderCalendarAdapter {
  #makeApi: MicrosoftCalendarListApiFactory;
  #makeMasterCategoryApi: MicrosoftMasterCategoryApiFactory;

  constructor(
    makeApi: MicrosoftCalendarListApiFactory = defaultApiFactory,
    makeMasterCategoryApi: MicrosoftMasterCategoryApiFactory = defaultMicrosoftMasterCategoryApiFactory,
  ) {
    this.#makeApi = makeApi;
    this.#makeMasterCategoryApi = makeMasterCategoryApi;
  }

  async discoverCalendars(input: {
    accessToken: string;
    cursor?: string;
  }): Promise<CalendarDiscovery> {
    void input.cursor;
    const api = this.#makeApi(input.accessToken);
    const calendarsById = new Map<string, DiscoveredCalendar>();

    const absorbPage = (items: readonly MicrosoftGraphCalendar[]) => {
      for (const item of items) {
        const mapped = mapCalendar(item);
        if (mapped && !calendarsById.has(mapped.providerCalendarId)) {
          calendarsById.set(mapped.providerCalendarId, mapped);
        }
      }
    };

    let groupsNextLink: string | undefined;
    do {
      const groupsPage = await this.#listCalendarGroupsPage(
        api,
        groupsNextLink,
      );
      for (const group of groupsPage.items) {
        if (!group.id) continue;
        let calendarsNextLink: string | undefined;
        do {
          const calendarsPage = await this.#listGroupCalendarsPage(
            api,
            group.id,
            calendarsNextLink,
          );
          absorbPage(calendarsPage.items);
          calendarsNextLink = calendarsPage.nextLink ?? undefined;
        } while (calendarsNextLink);
      }
      groupsNextLink = groupsPage.nextLink ?? undefined;
    } while (groupsNextLink);

    if (calendarsById.size === 0) {
      let nextLink: string | undefined;
      do {
        const page = await this.#listPage(api, nextLink);
        absorbPage(page.items);
        nextLink = page.nextLink ?? undefined;
      } while (nextLink);
    }

    const eventLabels = await listMicrosoftEventLabels(
      input.accessToken,
      this.#makeMasterCategoryApi,
    );

    return {
      calendars: [...calendarsById.values()].map((calendar) => ({
        ...calendar,
        eventLabels,
      })),
      cursor: null,
    };
  }

  async #listPage(
    api: MicrosoftCalendarListApi,
    nextLink?: string,
  ): Promise<MicrosoftCalendarListPage> {
    try {
      return await api.listPage({ nextLink });
    } catch (error) {
      throw new ProviderCalendarError(
        classifyDiscoveryError(error),
        "Microsoft rejected the calendar list read",
        { cause: microsoftFailureCause(error) },
      );
    }
  }

  async #listCalendarGroupsPage(
    api: MicrosoftCalendarListApi,
    nextLink?: string,
  ): Promise<MicrosoftCalendarGroupListPage> {
    try {
      return await api.listCalendarGroupsPage({ nextLink });
    } catch (error) {
      throw new ProviderCalendarError(
        classifyDiscoveryError(error),
        "Microsoft rejected the calendar group list read",
        { cause: microsoftFailureCause(error) },
      );
    }
  }

  async #listGroupCalendarsPage(
    api: MicrosoftCalendarListApi,
    groupId: string,
    nextLink?: string,
  ): Promise<MicrosoftCalendarListPage> {
    try {
      return await api.listGroupCalendarsPage(groupId, { nextLink });
    } catch (error) {
      throw new ProviderCalendarError(
        classifyDiscoveryError(error),
        "Microsoft rejected a calendar group list read",
        { cause: microsoftFailureCause(error) },
      );
    }
  }
}

function mapCalendar(item: MicrosoftGraphCalendar): DiscoveredCalendar | null {
  if (!item.id) return null;

  const canEdit = item.canEdit === true;
  const accessRole = mapAccessRole(item.isDefaultCalendar === true, canEdit);

  return {
    providerCalendarId: item.id,
    displayName: item.name?.trim() || item.id,
    color: resolveMicrosoftCalendarColor(item.hexColor, item.color),
    eventLabels: [],
    primary: item.isDefaultCalendar === true,
    active: true,
    accessRole,
    capabilities: microsoftDiscoveredCalendarCapabilities(canEdit),
    createsGoogleMeet: false,
    defaultPopupReminderMinutes: [],
  };
}

function mapAccessRole(
  isDefaultCalendar: boolean,
  canEdit: boolean,
): CalendarAccessRole {
  if (isDefaultCalendar) return "owner";
  if (canEdit) return "editor";
  return "viewer";
}

function classifyDiscoveryError(
  error: unknown,
): "authExpired" | "transient" | "discoveryFailed" {
  const status = microsoftStatus(error);
  if (status === 401) return "authExpired";
  if (isMicrosoftTransient(error, status)) return "transient";
  return "discoveryFailed";
}

class FetchMicrosoftCalendarListApi implements MicrosoftCalendarListApi {
  #accessToken: string;

  constructor(accessToken: string) {
    this.#accessToken = accessToken;
  }

  async listPage(params: {
    nextLink?: string;
  }): Promise<MicrosoftCalendarListPage> {
    const url =
      params.nextLink ??
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendars?${calendarListQuery}`;
    return this.#readCalendarPage(url);
  }

  async listCalendarGroupsPage(params: {
    nextLink?: string;
  }): Promise<MicrosoftCalendarGroupListPage> {
    const url =
      params.nextLink ?? `${MICROSOFT_GRAPH_BASE_URL}/me/calendarGroups`;
    const data = await microsoftGraphRequest<{
      value?: MicrosoftGraphCalendarGroup[];
      "@odata.nextLink"?: string;
    }>({
      accessToken: this.#accessToken,
      url,
      fallbackError: "microsoft_calendar_group_list_failed",
    });

    return {
      items: data.value ?? [],
      nextLink: data["@odata.nextLink"] ?? null,
    };
  }

  async listGroupCalendarsPage(
    groupId: string,
    params: { nextLink?: string },
  ): Promise<MicrosoftCalendarListPage> {
    const url =
      params.nextLink ??
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendarGroups/${encodeURIComponent(groupId)}/calendars?${calendarListQuery}`;
    return this.#readCalendarPage(url);
  }

  async #readCalendarPage(url: string): Promise<MicrosoftCalendarListPage> {
    const data = await microsoftGraphRequest<{
      value?: MicrosoftGraphCalendar[];
      "@odata.nextLink"?: string;
    }>({
      accessToken: this.#accessToken,
      url,
      fallbackError: "microsoft_calendar_list_failed",
    });

    return {
      items: data.value ?? [],
      nextLink: data["@odata.nextLink"] ?? null,
    };
  }
}
