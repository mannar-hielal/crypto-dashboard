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
      // generateSW: Vite generates the service worker automatically.
      // registerType 'autoUpdate': new SW activates on next page load without prompting.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],

      // Web App Manifest — controls how the app appears when installed on mobile/desktop
      manifest: {
        name: 'Crypto Dashboard',
        short_name: 'CryptoDash',
        description: 'Paper trade crypto with real-time Bybit price feeds',
        theme_color: '#080B14', // Browser chrome color on mobile
        background_color: '#080B14', // Splash screen background
        display: 'standalone', // Hides browser UI — feels like a native app
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
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
            purpose: 'any maskable', // 'maskable' = safe zone for Android adaptive icons
          },
        ],
      },

      // Workbox cache strategy
      workbox: {
        // Cache the app shell (HTML, JS, CSS, fonts, images) — stale-while-revalidate
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Never cache API calls — always go to network for live data
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Cache Cloudflare Pages assets
            urlPattern: /^https:\/\/crypto-dashboard-7yy\.pages\.dev\/.*/i,
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
});
