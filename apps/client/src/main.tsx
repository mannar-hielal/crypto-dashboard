import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import { removeStaticHeadTags } from './lib/staticHeadTags';
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

// Before the first render, so each page's own head tags are the only ones
removeStaticHeadTags();

createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
