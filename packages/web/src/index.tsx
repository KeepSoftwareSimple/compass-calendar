import {
  getPosthogClient,
  initPosthog,
} from "@web/auth/posthog/posthog.bootstrap";
import { reloadOnceForMissingChunk } from "@web/common/utils/browser/missing-chunk-reload.util";

initPosthog();

void import("./app.bootstrap")
  .then(({ bootstrapApp }) => bootstrapApp())
  .catch((error) => {
    // A deploy between this index.html and the import: one reload picks up
    // the new chunk names. Only a reload that still fails is worth a report.
    if (reloadOnceForMissingChunk(error)) return;

    getPosthogClient()?.captureException(error, {
      $exception_handled: false,
      $exception_source: "app-boot",
    });
    console.error("Failed to initialize the app:", error);

    const container = document.getElementById("root");
    if (!container) return;

    container.innerHTML =
      '<main style="align-items:center;display:flex;flex-direction:column;height:100vh;justify-content:center;padding:1.5rem;text-align:center"><h1>🏴‍☠️ We ran aground!</h1><p>The app failed to start.</p><button type="button">Reload the app</button></main>';
    container.querySelector("button")?.addEventListener("click", () => {
      window.location.reload();
    });
  });
