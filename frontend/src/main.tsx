import { logger } from '@/lib/logger';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Cleanup old PWA service worker and caches
// This code can be removed after a few weeks once most users have visited
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    logger.log('Cleanup service worker registered');
  }).catch((error) => {
    logger.log('Service worker registration failed (this is ok):', error);
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
