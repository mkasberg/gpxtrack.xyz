import { createGpxMiniatureComponents, GpxMiniatureParams } from './gpx-miniature';

interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  isEmpty: boolean;
}

interface WorkerResponse {
  baseMesh: MeshData;
  polylineMesh: MeshData;
  textMesh: MeshData;
  params: GpxMiniatureParams;
}

// LIFO pattern variables
let latestData: GpxMiniatureParams | null = null;
let isProcessing = false;

function manifoldToMeshData(manifold: any): MeshData {
  if (manifold.isEmpty()) {
    return {
      vertProperties: new Float32Array(0),
      triVerts: new Uint32Array(0),
      isEmpty: true
    };
  }

  const mesh = manifold.getMesh();
  return {
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
    isEmpty: false
  };
}

async function processNext() {
  if (latestData === null) {
    return; // No new data to process
  }

  const dataToProcess = latestData;
  latestData = null; // Clear the latest data to indicate it's being processed

  try {
    // Generate the model components
    const components = await createGpxMiniatureComponents(dataToProcess);
    
    // Convert each component to mesh data
    const baseMesh = manifoldToMeshData(components.base);
    const polylineMesh = manifoldToMeshData(components.polyline);
    const textMesh = manifoldToMeshData(components.text);
    
    const response: WorkerResponse = {
      baseMesh,
      polylineMesh,
      textMesh,
      params: dataToProcess
    };
    
    // Transfer the ArrayBuffers for performance
    const transferables = [
      baseMesh.vertProperties.buffer,
      baseMesh.triVerts.buffer,
      polylineMesh.vertProperties.buffer,
      polylineMesh.triVerts.buffer,
      textMesh.vertProperties.buffer,
      textMesh.triVerts.buffer
    ];
    
    self.postMessage(response, transferables);
  } catch (error) {
    console.error('Error in model worker:', error);
    // Send an error response with proper type handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ error: errorMessage });
  }

  isProcessing = false;

  // After processing, immediately check if new data has arrived
  // and start the next task if so.
  if (latestData !== null) {
    isProcessing = true;
    setTimeout(processNext, 0);
  }
}

self.addEventListener('message', async (event) => {
  const params: GpxMiniatureParams = event.data;
  latestData = params;
  
  if (!isProcessing) {
    // Set the flag immediately to prevent scheduling multiple processing calls.
    isProcessing = true;

    // Schedule the processing to start on the next event loop tick.
    // This allows this onmessage handler to return right away,
    // letting other pending messages in the queue be processed.
    setTimeout(processNext, 0);
  }
});