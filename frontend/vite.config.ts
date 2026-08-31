import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev, API + MCP requests are proxied to the local Node server
// (`node server/index.mjs`, default port 8720). In production the same
// server serves the built frontend directly, so no proxy is involved.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:8720'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': backend,
      '/mcp': backend,
    },
  },
})
