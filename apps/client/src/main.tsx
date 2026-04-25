import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import './index.css';

// Service worker is auto-registered by vite-plugin-pwa (registerType: 'autoUpdate')
// No manual registerSW call needed — the plugin injects it into the HTML at build time.

// In development, unregister any stale service workers so they cannot serve cached
// assets that lack Vite's React Fast Refresh preamble (which causes the
// "@vitejs/plugin-react can't detect preamble" error).
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
    }
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
