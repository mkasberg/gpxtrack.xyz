import Module from 'manifold-3d';
import type { Manifold, CrossSection } from 'manifold-3d';

// Single promise that will be reused for all initialization requests
let initPromise: Promise<{ Manifold: typeof Manifold; CrossSection: typeof CrossSection }> | null = null;

export async function getManifoldInstance() {
  if (!initPromise) {
    // Create the promise only once
    initPromise = (async () => {
      try {
        const wasm = await Module();
        wasm.setup();
        return {
          Manifold: wasm.Manifold,
          CrossSection: wasm.CrossSection
        };
      } catch (error) {
        // If initialization fails, clear the promise so it can be retried
        initPromise = null;
        throw error;
      }
    })();
  }

  return initPromise;
}