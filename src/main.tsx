import React from "react";
import { createRoot } from "react-dom/client";
// Geist, self-hosted. Drawn for Vercel's own products: the proportions are
// tighter and the curves cleaner than a workhorse UI face, which is what makes
// it read as considered rather than merely functional. Both axes are variable,
// so every weight comes from one file per family.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
