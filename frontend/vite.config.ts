import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || 5770}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${process.env.VITE_BACKEND_PORT || 5770}`,
        ws: true,
      },
      '/static': {
        target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || 5770}`,
        changeOrigin: true,
      }
    }
  }
})
