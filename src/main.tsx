import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadPrefs } from "./lib/prefs";

// apply saved theme etc. before first paint
loadPrefs().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
