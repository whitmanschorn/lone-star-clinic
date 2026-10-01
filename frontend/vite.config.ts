import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app only ever calls relative /api/... URLs. In development (and in
// `vite preview`) this proxy forwards them to the FastAPI server with the
// prefix stripped; in Docker, nginx does the same job.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    // Lets a Cloudflare quick tunnel reach the dev and preview servers.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // preview inherits proxy and allowedHosts from server.
  preview: {
    port: 8080,
    strictPort: true,
  },
})
