import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BufferAttribute, BufferGeometry, Mesh as ThreeMesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer, GridHelper, AxesHelper } from 'three';
import { defaultParams } from './gpx-miniature.js';

interface GpxMiniatureParams {
  title: string;
  fontSize: number;
  truncatePct: number;
  mapRotation: number;
  elevationValues: number[];
  latLngValues: [number, number][];
  width: number;
  plateDepth: number;
  thickness: number;
  textThickness: number;
  margin: number;
  maxPolylineHeight: number;
  baseColor: string;
  polylineColor: string;
  slantedTextPlate: boolean;
}

interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  isEmpty: boolean;
}

interface WorkerMeshData {
  baseMesh: MeshData;
  polylineMesh: MeshData;
  textMesh: MeshData;
  params: GpxMiniatureParams;
}

/**
 * Converts mesh data to a Three.js mesh with common transformations applied
 */
function meshDataToThreeMesh(
  meshData: MeshData, 
  material: MeshStandardMaterial, 
  params: GpxMiniatureParams
): ThreeMesh | null {
  if (meshData.isEmpty || meshData.vertProperties.length === 0) {
    return null;
  }

  // Create Three.js geometry
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(meshData.vertProperties, 3));
  geometry.setIndex(new BufferAttribute(meshData.triVerts, 1));
  
  geometry.computeVertexNormals();

  // Create mesh with shadows enabled
  const mesh = new ThreeMesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  // Apply common transformations
  // Rotate to align with Three.js coordinate system
  mesh.rotation.x = -Math.PI / 2;

  // Translate to the positive Z quadrant
  mesh.position.z = (params.width + params.plateDepth) / 2;
  mesh.position.x = -params.width / 2;

  return mesh;
}

export function setupPreview(canvas: HTMLCanvasElement, onParamsChange?: (params: GpxMiniatureParams) => void) {
  // Set up Three.js scene
  const scene = new Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  // Create camera with a better initial position
  const camera = new PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(50, 100, 75);
  camera.lookAt(0, 0, 0);

  // Set up Three.js renderer with better quality settings
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Add grid helper with better visibility
  const gridHelper = new GridHelper(200, 50, 0x444444, 0x444444);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  // Add axis helper
  //const axesHelper = new AxesHelper(50);
  //scene.add(axesHelper);

  // Edge-emphasizing lighting setup
  // Main light from top-right
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
  mainLight.position.set(100, 100, 0);
  mainLight.castShadow = false;
  scene.add(mainLight);

  // Edge light from top-left
  const edgeLight = new THREE.DirectionalLight(0xffffff, 0.8);
  edgeLight.position.set(-50, 100, 75);
  scene.add(edgeLight);

  // Back light for depth
  const backLight = new THREE.DirectionalLight(0xffffff, 0.6);
  backLight.position.set(0, 0, -100);
  scene.add(backLight);

  // Ambient light for overall scene illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // Create materials with edge emphasis
  const baseMaterial = new MeshStandardMaterial({
    color: defaultParams.baseColor,
    roughness: 0.2,
    metalness: 0.0,
    flatShading: true
  });

  const polylineMaterial = new MeshStandardMaterial({
    color: defaultParams.polylineColor,
    roughness: 0.2,
    metalness: 0.0,
    flatShading: true
  });

  let baseMesh: ThreeMesh | null = null;
  let polylineMesh: ThreeMesh | null = null;
  let textMesh: ThreeMesh | null = null;

  // Function to center and fit the object in view
  function centerAndFitObject() {
    if (!baseMesh && !polylineMesh && !textMesh) {
      return;
    }

    const box = new THREE.Box3();
    if (baseMesh) box.expandByObject(baseMesh);
    if (polylineMesh) box.expandByObject(polylineMesh);
    if (textMesh) box.expandByObject(textMesh);

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Calculate the distance needed to fit the object
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2)) * 0.9;

    // Set camera position with a better angle.
    camera.position.set(camera.position.x, camera.position.y, camera.position.z);

    camera.lookAt(center);

    // Reset controls target
    controls.target.copy(center);
    controls.update();
  }

  function updateMiniature(data: WorkerMeshData) {
    const { baseMesh: baseMeshData, polylineMesh: polylineMeshData, textMesh: textMeshData, params } = data;
    
    // Remove old meshes if they exist
    if (baseMesh) {
      scene.remove(baseMesh);
      baseMesh.geometry.dispose();
      baseMesh = null;
    }
    if (polylineMesh) {
      scene.remove(polylineMesh);
      polylineMesh.geometry.dispose();
      polylineMesh = null;
    }
    if (textMesh) {
      scene.remove(textMesh);
      textMesh.geometry.dispose();
      textMesh = null;
    }

    // Update material colors
    baseMaterial.color.set(params.baseColor);
    polylineMaterial.color.set(params.polylineColor);

    // Convert mesh data to Three.js meshes using the helper function
    baseMesh = meshDataToThreeMesh(baseMeshData, baseMaterial, params);
    if (baseMesh) {
      scene.add(baseMesh);
    }

    polylineMesh = meshDataToThreeMesh(polylineMeshData, polylineMaterial, params);
    if (polylineMesh) {
      scene.add(polylineMesh);
    }

    // Use polyline material for text to maintain the same color
    textMesh = meshDataToThreeMesh(textMeshData, polylineMaterial, params);
    if (textMesh) {
      scene.add(textMesh);
    }

    centerAndFitObject();
  }

  // Add orbit controls with better settings
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 10;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI / 2; // Prevent going below the ground
  controls.screenSpacePanning = true; // Better panning behavior
  controls.rotateSpeed = 0.5; // Slower rotation for more control

  // Handle window resize
  window.addEventListener('resize', () => {
    // hide the canvas for a second so the CSS grid can resize it
    canvas.removeAttribute('style');
    canvas.width = 0;
    canvas.height = 0;
    // then  the CSS will size it
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    centerAndFitObject();
  });

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Return function to update the miniature
  return updateMiniature;
}