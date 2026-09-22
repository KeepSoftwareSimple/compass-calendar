import { App } from "@booking-web/App";
import { createRoot } from "react-dom/client";
import "@booking-web/index.css";

export async function bootstrapApp(): Promise<void> {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root container with id 'root' not found in index.html");
  }

  createRoot(container).render(<App />);
}
