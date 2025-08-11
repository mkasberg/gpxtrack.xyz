import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['manifold-3d']
  },
  build: {
    target: 'esnext',
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: resolve('src', 'index.html'),
        app: resolve('src', 'app.html'),
      }
    }
  },
  plugins: [
    tailwindcss()
  ]
})