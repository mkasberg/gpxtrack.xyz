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

self.addEventListener('message', async (event) => {
  try {
    const params: GpxMiniatureParams = event.data;
    
    // Generate the model components
    const components = await createGpxMiniatureComponents(params);
    
    // Convert each component to mesh data
    const baseMesh = manifoldToMeshData(components.base);
    const polylineMesh = manifoldToMeshData(components.polyline);
    const textMesh = manifoldToMeshData(components.text);
    
    const response: WorkerResponse = {
      baseMesh,
      polylineMesh,
      textMesh,
      params
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
    // Send an error response
    self.postMessage({ error: error.message });
  }
});