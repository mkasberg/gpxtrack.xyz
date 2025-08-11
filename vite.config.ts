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
        main: resolve(process.cwd(), 'src', 'index.html'),
        app: resolve(process.cwd(), 'src', 'app.html'),
      }
    }
  },
  plugins: [
    tailwindcss()
  ]
})