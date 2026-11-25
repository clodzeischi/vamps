import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/theme.css";
import "./ui/reliquary.css";
import { HANDLES } from "./ui/handles";
import { useStore } from "./ui/store";

// Dev and e2e builds: the store on window, for the browser tests (e2e/).
if (HANDLES) (window as unknown as { vamps: typeof useStore }).vamps = useStore;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
