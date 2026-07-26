import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // generateSW: vite-plugin-pwa generates the service worker automatically using Workbox.
      // registerType 'autoUpdate': new SW activates on next page load without prompting.
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'logo.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-120x120.png',
        'pwa-152x152.png',
        'pwa-167x167.png',
        'pwa-180x180.png',
        'splash-2732x2732.png',
      ],

      // Web App Manifest — controls how the app appears when installed on mobile/desktop
      manifest: {
        name: 'cryptopapertrade.com',
        short_name: 'CP Trade',
        description: 'Paper trade crypto with real-time Bybit price feeds',
        theme_color: '#080B14', // Browser chrome color on mobile
        background_color: '#080B14', // Splash screen background
        display: 'standalone', // Hides browser UI — feels like a native app
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['finance', 'productivity'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-180x180.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: 'pwa-152x152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: 'pwa-167x167.png',
            sizes: '167x167',
            type: 'image/png',
          },
          {
            src: 'pwa-120x120.png',
            sizes: '120x120',
            type: 'image/png',
          },
        ],
      },

      // Enable SW registration in Vite dev server only when explicitly opted in.
      // Keeping it always-on causes cached assets to persist across reloads even
      // after config changes, which makes local debugging confusing.
      //
      // To enable: add VITE_PWA_DEV_SW=true to apps/client/.env.local
      // To disable again: remove the flag or set it to false, then clear site
      // data in DevTools → Application → Storage → Clear site data.
      devOptions: {
        enabled: process.env['VITE_PWA_DEV_SW'] === 'true',
        type: 'module',
      },

      // Workbox cache strategy
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB (home-bg.svg is ~2.2 MiB)
        // Cache the app shell (HTML, JS, CSS, fonts, images) — stale-while-revalidate
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Never cache API calls — always go to network for live data
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Cache same-origin static assets only — explicitly excludes /api/* so auth/session
            // responses are never served from the SW cache (always go to network for live data).
            urlPattern: ({ url }) =>
              (url.protocol === 'http:' || url.protocol === 'https:') &&
              !url.pathname.startsWith('/api/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-shell',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 }, // 1 day
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Allows: import { Button } from '@/components/ui/button'
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    headers: {
      // 🔐 Dev-only CSP — applies ONLY to the Vite dev server, never deployed.
      // Production CSP is enforced by @fastify/helmet on the server side.
      //
      // 'unsafe-eval' is required by two specific dev-only tools:
      //   1. esbuild (Vite's bundler) — uses eval() to reconstruct source maps
      //      in development. Removed automatically in production builds.
      //   2. Framer Motion — its WAAPI polyfill uses new Function() at runtime
      //      for keyframe interpolation. No safer alternative exists in v12.
      //   No safer alternative (nonces/hashes) is viable here because both tools
      //   generate code dynamically at runtime rather than at build time.
      //
      // 'unsafe-inline' is required by @vitejs/plugin-react (all versions) — it
      // injects an inline <script type="module"> preamble that sets up the React
      // Fast Refresh globals ($RefreshReg$, $RefreshSig$, __vite_plugin_react_preamble_installed__).
      // Without it the browser blocks the preamble and every React component file
      // throws "can't detect preamble" which breaks HMR entirely.
      // This header is ONLY served by the Vite dev server — never in production.
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws://localhost:3001 http://localhost:3001",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
      ].join('; '),
    },
  },
});
