import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['manifold-3d']
  },
  build: {
    target: 'esnext',
    outDir: '../dist',
  }
})