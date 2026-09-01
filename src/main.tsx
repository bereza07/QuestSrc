import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

// Register the PWA service worker only in the built WEB app.
//
// Inside the Tauri desktop app we deliberately skip it: the app is local
// (there's no offline-vs-online story to solve) and a stale SW cache can
// serve an outdated index.html whose JS chunks no longer exist after an
// update — the classic "black then white screen" symptom. If a prior build
// already registered one, unregister it and clear its caches so users on
// broken installs recover on next launch.
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if ("serviceWorker" in navigator) {
  if (isTauri) {
    // Clean up any SW that a previous build registered inside the desktop app.
    void navigator.serviceWorker.getRegistrations().then((rs) => {
      for (const r of rs) void r.unregister();
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  } else if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
