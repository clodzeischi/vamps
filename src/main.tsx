import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/theme.css";
import "./ui/reliquary.css";
import { useStore } from "./ui/store";

// Dev builds only: the store on window, for driving the UI from browser checks.
if (import.meta.env.DEV) (window as unknown as { vamps: typeof useStore }).vamps = useStore;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
