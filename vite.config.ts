import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

/** Baked into the bundle at build time so the Profile screen can show exactly which build a
 * device is running — the fastest way to tell "the fix isn't deployed yet" apart from "the
 * fix is deployed but this device is still executing a cached older bundle" (Telegram's own
 * WebView has repeatedly turned out to cache Mini App bundles more stubbornly than standard
 * HTTP cache headers would suggest). */
function getBuildId(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(getBuildId()),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
})
