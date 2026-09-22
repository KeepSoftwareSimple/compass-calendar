import { App } from "@booking-web/App";
import { createRoot } from "react-dom/client";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container with id 'root' not found in index.html");
}

createRoot(container).render(<App />);
