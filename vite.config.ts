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

/**
 * SEO & STATIC PAGE GENERATION
 * 
 * WHY: This project is a client-side application (SPA). By default, search engines and
 * social media crawlers only see a single "app.html" and cannot index specific models
 * that are loaded via URL parameters (like ?model=nyc).
 * 
 * WHAT: This function generates a unique, physical .html file for every model JSON
 * found in "public/models/". These pages are then used as separate entry points
 * in the Vite build.
 * 
 * HOW:
 * 1. It reads "app.html" as a base template.
 * 2. For each model (e.g., "nyc.json"), it extracts the title and description.
 * 3. It uses regex to inject unique <title>, <meta description>, and Open Graph tags.
 * 4. It fixes relative asset paths (../../) because these pages live in a subdirectory.
 * 5. It injects a "window.INITIAL_MODEL" script so the JS knows which model to load.
 * 6. The generated files are saved to "src/models/" (ignored by git).
 */
function generateModelPages() {
  const templatePath = resolve(__dirname, 'src/app.html');
  const template = readFileSync(templatePath, 'utf-8');
  const targetDir = resolve(__dirname, 'src/models');

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  models.forEach(model => {
    // Load model JSON to get description
    const modelJsonPath = resolve(modelsDir, `${model}.json`);
    const modelData = JSON.parse(readFileSync(modelJsonPath, 'utf-8'));
    const modelDescription = modelData.description || '';

    let capitalized = model.charAt(0).toUpperCase() + model.slice(1);
    if (model === 'nyc') capitalized = 'NYC';
    const title = `${capitalized} Marathon 3D Model | GPXTrack.xyz`;
    const description = modelDescription || `3D printable STL model of the ${capitalized} Marathon route. Create custom figurines and art from your activity tracks.`;
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
      // Inject description or remove placeholder if empty
      .replace('<!-- description-placeholder -->', modelDescription ? `<p>${modelDescription}</p>` : '')
      // Remove the hidden class from the description div container if description exists
      .replace('id="model-description" class="hidden ', `id="model-description" class="${modelDescription ? '' : 'hidden '} `)
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
