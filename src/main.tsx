import React from "react";
import { createRoot } from "react-dom/client";
// Self-hosted variable fonts: one file per family, served from our own origin,
// so there is no third-party request and no flash of a fallback face.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
