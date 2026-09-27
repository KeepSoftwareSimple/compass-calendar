import { ROOT_ROUTES } from "@web/common/constants/routes";

/** True for `/life` and any nested life path. */
export function isLifePathname(pathname: string): boolean {
  return (
    pathname === ROOT_ROUTES.LIFE || pathname.startsWith(`${ROOT_ROUTES.LIFE}/`)
  );
}
