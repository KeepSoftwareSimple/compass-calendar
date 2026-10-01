import {
  DESKTOP_QUICK_ADD_SEARCH_PARAM,
  type DesktopQuickAddHotkey,
} from "@core/desktop/desktop-quick-add.contract";
import {
  isSearchFlagOn,
  type SearchFlag,
} from "@web/common/utils/parse/search-flag.util";

export function isDesktopQuickAddRequested(search: {
  [DESKTOP_QUICK_ADD_SEARCH_PARAM]?: SearchFlag;
}): boolean {
  return isSearchFlagOn(search[DESKTOP_QUICK_ADD_SEARCH_PARAM]);
}

export type DesktopQuickAddSearch = {
  [DESKTOP_QUICK_ADD_SEARCH_PARAM]?: SearchFlag;
};

export type { DesktopQuickAddHotkey };
export { DESKTOP_QUICK_ADD_SEARCH_PARAM };
