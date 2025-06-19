import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

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
  },
  plugins: [
    tailwindcss(),
  ]
})
