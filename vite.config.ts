import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Registered by hand in main.tsx so the control room can offer an
      // update rather than reloading out from under a half-typed incident.
      injectRegister: null,
      registerType: 'prompt',

      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'tide-logo.png', 'tide-logo-white.png'],

      // The manifest lives in public/ and is deliberately NOT linked from
      // index.html. For a single-page app that link would appear on every
      // page, so a member of the public reading about Martyn's Law could be
      // offered an install of an incident logging tool. PwaStatus attaches it
      // at runtime, only while the user is inside /control.
      manifest: false,

      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // The export chunk alone is ~430kB; the default 2MiB cap would drop it.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

        runtimeCaching: [
          {
            // Never, ever cache incident data. A control room acting on a
            // stale board is worse than a control room that knows it is
            // offline, so every Supabase call goes to the network or fails
            // loudly. This rule is here to be explicit about that.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'tide-font-css' },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tide-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Marketing imagery only — nothing here informs an operational
            // decision, so serving it from cache while it revalidates is fine.
            urlPattern: ({ url }) => url.hostname.endsWith('pexels.com'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tide-site-images',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: { enabled: false },
    }),
  ],
})
