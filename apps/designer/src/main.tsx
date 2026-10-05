import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyInterfaceTheme, useStore } from "./store";

applyInterfaceTheme(useStore.getState().interfaceTheme);
createRoot(document.getElementById("root")!).render(<App />);

// Exposed for automated tests and debugging in the browser console.
(window as any).__designer = useStore;
