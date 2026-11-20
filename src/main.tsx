import React from "react";
import { createRoot } from "react-dom/client";
// The Fastex Media pair (brandkit.fastexmedia.com): Newsreader for headings and
// numbers, Inter for everything else. Self-hosted, one variable file each.
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader/opsz.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
