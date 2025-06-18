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

  console.log(`[WORKER] Processing started at ${performance.now().toFixed(2)}ms - title: "${dataToProcess.title}", width: ${dataToProcess.width}`);

  try {
    console.log(`[WORKER] Starting createGpxMiniatureComponents at ${performance.now().toFixed(2)}ms`);
    // Generate the model components
    const components = await createGpxMiniatureComponents(dataToProcess);
    console.log(`[WORKER] Finished createGpxMiniatureComponents at ${performance.now().toFixed(2)}ms`);
    
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
    
    console.log(`[WORKER] Sending response at ${performance.now().toFixed(2)}ms - title: "${dataToProcess.title}", width: ${dataToProcess.width}`);
    
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
    // Send an error response
    self.postMessage({ error: error.message });
  }

  isProcessing = false;
  console.log(`[WORKER] Processing finished at ${performance.now().toFixed(2)}ms - title: "${dataToProcess.title}", width: ${dataToProcess.width}`);

  // After processing, immediately check if new data has arrived
  // and start the next task if so.
  if (latestData !== null) {
    console.log(`[WORKER] New data available, starting next task immediately - title: "${latestData.title}", width: ${latestData.width}`);
    isProcessing = true;
    setTimeout(processNext, 0);
  } else {
    console.log(`[WORKER] No new data, worker idle at ${performance.now().toFixed(2)}ms`);
  }
}

self.addEventListener('message', async (event) => {
  const params: GpxMiniatureParams = event.data;
  latestData = params;
  
  console.log(`[WORKER] Message received at ${performance.now().toFixed(2)}ms - title: "${params.title}", width: ${params.width}, isProcessing: ${isProcessing}`);
  
  if (!isProcessing) {
    // Set the flag immediately to prevent scheduling multiple processing calls.
    isProcessing = true;

    // Schedule the processing to start on the next event loop tick.
    // This allows this onmessage handler to return right away,
    // letting other pending messages in the queue be processed.
    setTimeout(processNext, 0);
  }
});