import { useEffect } from "react";

/**
 * Points `<link rel="canonical">` at this page while it is mounted, so public
 * pages like /life and /shortcuts canonicalize to themselves instead of the
 * homepage URL that index.html ships with. Restores the original on unmount.
 */
export const useCanonicalPath = (pathname: string) => {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const previous = link?.getAttribute("href");
    if (!link || previous == null) return;

    link.setAttribute("href", new URL(pathname, previous).href);
    return () => {
      link.setAttribute("href", previous);
    };
  }, [pathname]);
};
