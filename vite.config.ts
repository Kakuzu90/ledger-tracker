import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The version the settings screen prints. Read from package.json so there
// is one place to bump it.
const { version } = createRequire(import.meta.url)('./package.json') as { version: string }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // dexie-react-hooks pulls its own React otherwise, and two copies of
    // React break every hook in the components that use it.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        // Named, so the precache can exclude it by glob. Left to itself
        // Rollup emits several `index.esm-<hash>.js`, which match
        // nothing useful.
        manualChunks: (id) =>
          /node_modules\/(firebase|@firebase)\//.test(id) ? 'firebase' : undefined,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' drives the in-app update banner (see src/ui/UpdateBanner.tsx).
      // An auto-reloading ledger could swap the bundle mid-entry.
      registerType: 'prompt',
      // Neither `includeAssets` nor the plugin's own manifest-icon pass:
      // everything in public/ is a png or an svg, so the glob below already
      // has all of it. Letting both sides contribute put ten duplicate
      // entries in the precache manifest and overstated its size by a third.
      includeManifestIcons: false,
      manifest: {
        // A stable id, so changing start_url later does not look to the
        // browser like a different app and strand the installed one.
        id: '/',
        name: 'Ledger — Expenses & Loans',
        short_name: 'Ledger',
        description:
          'Track expenses, loans, bills and budgets. Works offline; all data stays on your device.',
        lang: 'en',
        dir: 'ltr',
        categories: ['finance', 'productivity'],
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F7F4',
        theme_color: '#0F6E64',
        prefer_related_applications: false,
        // A shortcut on an app that is already open should land in the
        // window that is already there, not a second copy of the ledger.
        launch_handler: { client_mode: 'navigate-existing' },
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable art is inset so it survives a circular or squircle crop.
          { src: 'pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // The four things worth doing from a long-press on the icon. Quick
        // Add is a sheet rather than a route, so it arrives as a parameter
        // that src/lib/launch.ts turns back into an action.
        shortcuts: [
          {
            name: 'Add an expense',
            short_name: 'Add',
            url: '/?add=expense',
            icons: [{ src: 'shortcut-add.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Activity',
            short_name: 'Activity',
            url: '/activity',
            icons: [{ src: 'shortcut-activity.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Loans',
            short_name: 'Loans',
            url: '/loans',
            icons: [{ src: 'shortcut-loans.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Reports',
            short_name: 'Reports',
            url: '/reports',
            icons: [{ src: 'shortcut-reports.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Everything the app needs is built or self-hosted — fonts included —
        // so the whole lot is precached and there is nothing left to fetch at
        // runtime. That is what makes a cold start offline work, and it is
        // why there are no runtimeCaching rules: there is no third party to
        // cache.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        /*
         * Firebase is the one thing deliberately left out of the
         * precache. It is only reached if push is switched on, it is
         * larger than the rest of the app put together, and it cannot
         * do anything offline anyway — precaching it would make every
         * cold start pay for a feature most installs never use.
         *
         * Its own service worker is excluded for the same reason plus
         * a better one: a worker should not be precached by a worker.
         */
        globIgnores: ['**/firebase-*.js', 'firebase-messaging-sw.js'],
        // Every route is served by the one document; without this, opening
        // /loans offline would ask the network for a page that does not exist.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
