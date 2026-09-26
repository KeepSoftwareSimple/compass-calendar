import { MICROSOFT_CATEGORY_PRESET_HEX } from "@sync/providers/microsoft/microsoft-event-category.map";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import { MICROSOFT_GRAPH_BASE_URL } from "@sync/providers/microsoft/microsoft-http.constants";

export interface GraphOutlookCategory {
  readonly id?: string;
  readonly displayName?: string;
  readonly color?: string;
}

export interface MicrosoftMasterCategoryApi {
  list(): Promise<readonly GraphOutlookCategory[]>;
}

export type MicrosoftMasterCategoryApiFactory = (
  accessToken: string,
) => MicrosoftMasterCategoryApi;

export const defaultMicrosoftMasterCategoryApiFactory: MicrosoftMasterCategoryApiFactory =
  (accessToken) => new FetchMicrosoftMasterCategoryApi(accessToken);

// Outlook master categories for the signed-in mailbox, mapped to the
// provider-neutral eventLabels shape (id = displayName, hex = preset fill).
export async function listMicrosoftEventLabels(
  accessToken: string,
  makeApi: MicrosoftMasterCategoryApiFactory = defaultMicrosoftMasterCategoryApiFactory,
): Promise<readonly { readonly id: string; readonly hex: string }[]> {
  const api = makeApi(accessToken);
  const categories = await api.list();
  const labels: { id: string; hex: string }[] = [];
  for (const category of categories) {
    const name = category.displayName?.trim();
    const preset = category.color?.toLowerCase();
    if (!name || !preset || preset === "none") continue;
    const hex = MICROSOFT_CATEGORY_PRESET_HEX[preset];
    if (!hex) continue;
    labels.push({ id: name, hex });
  }
  return labels;
}

class FetchMicrosoftMasterCategoryApi implements MicrosoftMasterCategoryApi {
  #accessToken: string;

  constructor(accessToken: string) {
    this.#accessToken = accessToken;
  }

  async list(): Promise<readonly GraphOutlookCategory[]> {
    const data = await microsoftGraphRequest<{
      value?: GraphOutlookCategory[];
    }>({
      accessToken: this.#accessToken,
      url: `${MICROSOFT_GRAPH_BASE_URL}/me/outlook/masterCategories`,
      method: "GET",
      headers: { Prefer: 'outlook.timezone="UTC"' },
      fallbackError: "microsoft_master_categories_failed",
    });
    return data.value ?? [];
  }
}
