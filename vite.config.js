import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      true,
      '.modal.host',
      'localhost',
      '127.0.0.1',
    ],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: [
      true,
      '.modal.host',
      'localhost',
      '127.0.0.1',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})