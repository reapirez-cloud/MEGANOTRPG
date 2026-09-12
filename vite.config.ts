import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(import.meta.dirname, "index.html"),
        uiV1Alias: path.resolve(import.meta.dirname, "ui-v1.html"),
        legacy: path.resolve(import.meta.dirname, "legacy.html")
      }
    }
  }
})
