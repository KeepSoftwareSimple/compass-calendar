import { initPosthog } from "@web/auth/posthog/posthog.bootstrap";

initPosthog();

void import("./app.bootstrap")
  .then(({ bootstrapApp }) => bootstrapApp())
  .catch((error) => {
    console.error("Failed to initialize booking-web:", error);
    const container = document.getElementById("root");
    if (!container) return;
    container.innerHTML =
      '<main style="align-items:center;display:flex;flex-direction:column;height:100vh;justify-content:center;padding:1.5rem;text-align:center"><h1>Could not load booking</h1><p>The meeting page failed to start.</p><button type="button">Reload</button></main>';
    container.querySelector("button")?.addEventListener("click", () => {
      window.location.reload();
    });
  });
