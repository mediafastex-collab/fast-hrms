import React from "react";
import { createRoot } from "react-dom/client";
// IBM Plex, self-hosted: the typeface IBM drew for its own software, which is
// why it reads as engineering tooling rather than marketing. Sans carries the
// interface; Mono carries anything the eye has to scan in a column — amounts,
// employee codes, clock times, ids.
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
// 700 as well: the money figures are bold, and weight synthesis is off.
import "@fontsource/ibm-plex-mono/700.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
