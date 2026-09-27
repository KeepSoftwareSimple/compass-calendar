import { useDocumentTitle } from "./useDocumentTitle";

/** Headless mount for the live browser tab title. */
export function DocumentTitle() {
  useDocumentTitle();
  return null;
}
