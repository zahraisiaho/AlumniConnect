import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Testers reach this dev server through a public tunnel (e.g. a Cloudflare quick tunnel), whose hostname changes each time.
    allowedHosts: true,
    // The browser calls /api on the same origin and Vite forwards it to the backend,
    // so only port 5173 has to be exposed and the browser sees no cross-origin requests.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
})
