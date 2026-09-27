import { ROOT_ROUTES } from "@web/common/constants/routes";

/**
 * View navigation shortcuts mapping.
 * Single source of truth for keyboard shortcuts used to navigate between views.
 */
export const VIEW_SHORTCUTS = {
  day: { key: "d", label: "Day", route: ROOT_ROUTES.DAY },
  week: { key: "w", label: "Week", route: ROOT_ROUTES.WEEK },
} as const;

export const LIFE_SHORTCUT = {
  key: "l",
  label: "Life",
  route: ROOT_ROUTES.LIFE,
} as const;

export type ViewName = keyof typeof VIEW_SHORTCUTS | "life";
