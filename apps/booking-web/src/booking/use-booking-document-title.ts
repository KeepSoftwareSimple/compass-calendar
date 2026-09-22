import { useEffect } from "react";
import {
  DEFAULT_DOCUMENT_TITLE,
  DOCUMENT_TITLE_BRAND,
} from "@web/components/DocumentTitle/formatDocumentTitle";

/**
 * Public pages cannot mount the authenticated DocumentTitle (it reads Up Next
 * and view stores), so booking routes name their tabs with this instead.
 * Null keeps the default until the page knows what to call itself.
 */
export function useBookingDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) {
      return;
    }
    document.title = `${title} - ${DOCUMENT_TITLE_BRAND}`;
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [title]);
}
