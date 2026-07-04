import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Telegram opens the Mini App over HTTPS via a tunnel (cloudflared/ngrok).
    // Allow LAN access so the tunnel can reach the dev server...
    host: true,
    // ...and allowlist the tunnel's Host header, which Vite blocks by default (dev-only, safe to relax).
    allowedHosts: ['.trycloudflare.com'],
  },
})
