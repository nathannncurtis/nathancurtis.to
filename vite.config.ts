import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { contentIndex } from './vite/content-index'

export default defineConfig({
  plugins: [react(), tailwindcss(), contentIndex()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
