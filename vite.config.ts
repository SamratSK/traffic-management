import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bnmit-api': {
        target: 'http://10.235.32.214:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bnmit-api/, ''),
      },
    },
  },
})
