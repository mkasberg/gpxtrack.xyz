import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find all models in the models directory
const modelsDir = resolve(__dirname, 'public/models');
const models = readdirSync(modelsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

// Function to generate the model pages during the build/dev process
function generateModelPages() {
  const templatePath = resolve(__dirname, 'src/app.html');
  const template = readFileSync(templatePath, 'utf-8');
  const targetDir = resolve(__dirname, 'src/models');

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  models.forEach(model => {
    let capitalized = model.charAt(0).toUpperCase() + model.slice(1);
    if (model === 'nyc') capitalized = 'NYC';
    const title = `${capitalized} Marathon 3D Model | GPXTrack.xyz`;
    const description = `3D printable STL model of the ${capitalized} Marathon route. Create custom figurines and art from your activity tracks.`;
    const imagePath = `/assets/${model}_model.png`;
    const ogImage = existsSync(resolve(__dirname, 'public', imagePath.slice(1))) 
      ? `https://gpxtrack.xyz${imagePath}` 
      : 'https://gpxtrack.xyz/assets/og.jpg';
    
    // Improved replacement logic for SEO tags and fix relative paths for the subdirectory
    let content = template
      .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
      .replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/s, `<meta name="description" content="${description}">`)
      .replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/is, `<meta property="og:title" content="${title}" />`)
      .replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/is, `<meta property="og:description" content="${description}" />`)
      .replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/is, `<meta property="og:image" content="${ogImage}" />`)
      .replace(/<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/is, `<meta name="twitter:image" content="${ogImage}" />`)
      .replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/is, `<meta property="og:url" content="https://gpxtrack.xyz/models/${model}.html" />`)
      // Fix relative paths because we are now in a subdirectory
      .replace('href="./styles.css"', 'href="../styles.css"')
      .replace('src="./app.ts"', 'src="../app.ts"')
      .replace('</head>', `<script>window.INITIAL_MODEL = "${model}";</script></head>`);
    
    writeFileSync(resolve(targetDir, `${model}.html`), content);
  });
}

// Generate the pages when the config is loaded
generateModelPages();

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
        main: resolve(__dirname, 'src/index.html'),
        app: resolve(__dirname, 'src/app.html'),
        ...Object.fromEntries(models.map(m => [m, resolve(__dirname, `src/models/${m}.html`)]))
      }
    }
  },
  plugins: [
    tailwindcss()
  ]
})
