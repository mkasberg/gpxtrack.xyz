import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BufferAttribute, BufferGeometry, Mesh as ThreeMesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer, GridHelper, AxesHelper, HemisphereLight } from 'three';
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
 * Creates a gradient background using a large sphere with gradient material
 */
function createGradientBackground(scene: THREE.Scene, renderer: WebGLRenderer) {
  // Create a large sphere geometry that will act as our background
  const sphereGeometry = new THREE.SphereGeometry(500, 32, 32);
  
  // Create a canvas for the gradient texture
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  
  // Create a vertical linear gradient from top to bottom
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  
  // Royal blue to dusk blue gradient - focused on visible portion (0.5 to 1.0)
  gradient.addColorStop(0,   '#c905ff');    // Top: Deep purple
  gradient.addColorStop(0.2, '#7605ff');    // Upper-mid: purple
  gradient.addColorStop(0.45, '#0566ed');   // Mid: blue
  gradient.addColorStop(0.75, '#0a97fc');   // Lower-mid: Bright Sky-blue
  gradient.addColorStop(1,    '#0041cc');   // Bottom: dark blue
  
  // Fill the canvas with the gradient
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  
  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  
  // Create material that will be unaffected by lighting
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide, // Render on the inside of the sphere
    fog: false
  });
  
  // Create the background sphere
  const backgroundSphere = new THREE.Mesh(sphereGeometry, material);
  scene.add(backgroundSphere);
  
  return backgroundSphere;
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
  // Remove the solid background color since we'll use a gradient background
  // scene.background = new THREE.Color(0x1a1a1a);

  // Create camera with a better initial position
  const camera = new PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(50, 100, 75);
  camera.lookAt(0, 0, 0);

  // Set up Three.js renderer with better quality settings and shadows
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Create the gradient background
  const backgroundSphere = createGradientBackground(scene, renderer);

  // Add grid helper with better visibility - enable shadow receiving
  const gridHelper = new GridHelper(200, 50, 0x444444, 0x444444);
  gridHelper.position.y = -0.01;
  gridHelper.receiveShadow = true;
  scene.add(gridHelper);

  // Add axis helper
  //const axesHelper = new AxesHelper(50);
  //scene.add(axesHelper);

  // Edge-emphasizing lighting setup with shadow configuration
  // Main light from top-right with shadows - warm golden sunrise light
  const mainLight = new THREE.DirectionalLight(0xFFD700, 0.9); // Golden color, slightly reduced intensity
  mainLight.position.set(100, 100, 0);
  mainLight.castShadow = true;
  
  // Configure shadow camera to encompass the model area
  // Since model is centered at origin and roughly params.width in size,
  // we'll set up the shadow camera to cover a bit more than that area
  const shadowSize = defaultParams.width * 1.5; // Add some padding
  mainLight.shadow.camera.left = -shadowSize / 2;
  mainLight.shadow.camera.right = shadowSize / 2;
  mainLight.shadow.camera.top = shadowSize / 2;
  mainLight.shadow.camera.bottom = -shadowSize / 2;
  mainLight.shadow.camera.near = 50;
  mainLight.shadow.camera.far = 200;
  
  // Higher resolution shadow map for better quality
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  
  // Reduce shadow acne with bias
  mainLight.shadow.bias = -0.0001;
  
  scene.add(mainLight);

  // Edge light from top-left - soft warm peach fill light (no shadows to avoid conflicts)
  const edgeLight = new THREE.DirectionalLight(0xFFE0B2, 0.8); // Light warm peach
  edgeLight.position.set(-50, 100, 75);
  scene.add(edgeLight);

  // Back light for depth - subtle cream tone (no shadows)
  const backLight = new THREE.DirectionalLight(0xFFF8DC, 0.6); // Cream color
  backLight.position.set(0, 0, -100);
  scene.add(backLight);

  // Hemisphere light for sunrise effect - simulates natural outdoor lighting
  const hemisphereLight = new HemisphereLight(
    0xFFCC80, // Sky color - warm sunrise orange
    0x443300, // Ground color - dark earthy brown
    0.5       // Intensity
  );
  scene.add(hemisphereLight);

  // Ambient light with warm sunrise tone
  const ambientLight = new THREE.AmbientLight(0xFFCC80, 0.2);
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

    // Update shadow camera size based on current model parameters
    const shadowSize = params.width * 1.5;
    mainLight.shadow.camera.left = -shadowSize / 2;
    mainLight.shadow.camera.right = shadowSize / 2;
    mainLight.shadow.camera.top = shadowSize / 2;
    mainLight.shadow.camera.bottom = -shadowSize / 2;
    mainLight.shadow.camera.updateProjectionMatrix();

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