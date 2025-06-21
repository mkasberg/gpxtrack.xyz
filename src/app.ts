import { exportTo3MF } from './export';
import { setupPreview } from "./preview";
import { createGpxMiniatureForExport, defaultParams, GpxMiniatureParams } from "./gpx-miniature";

const MAX_GPX_POINTS = 200;

// Global state for current parameters
let currentGpxParams: GpxMiniatureParams = { ...defaultParams };

// Initialize the preview
const canvas = document.getElementById("preview") as HTMLCanvasElement;
const updateMiniature = setupPreview(canvas);

// Initialize the web worker
const worker = new Worker(new URL('./model-worker.ts', import.meta.url), { type: 'module' });

// Handle messages from the worker
worker.onmessage = (event) => {
  const { baseMesh, polylineMesh, textMesh, params, error } = event.data;
  
  if (error) {
    console.error('Worker error:', error);
    return;
  }
  
  // Update the preview with the generated mesh data
  updateMiniature({ baseMesh, polylineMesh, textMesh, params });
};

const controls = document.querySelector<HTMLFormElement>("#controls");

// Get all range inputs
const inputs = Array.from(controls?.querySelectorAll<HTMLInputElement>("input") ?? []).filter(input => !input.classList.contains('value-display'));
// todo - I have a tip somewhere on an easy way to split this into two arrays
const displayInputs = Array.from(controls?.querySelectorAll<HTMLInputElement>("input") ?? []).filter(input => input.classList.contains('value-display'));


function parseFormData(data: FormData) {
  const params: Record<string, any> = {};
  for(const [key, value] of data.entries()) {
    // Skip file inputs - they are handled separately
    if (value instanceof File) {
      continue;
    }
    
    // First see if it's a checkbox
    if(value === "on") {
      params[key] = true;
    } else {
      const maybeNumber = parseFloat(value as string);
      params[key] = isNaN(maybeNumber) ? value : maybeNumber;
    }
  }
  return params as GpxMiniatureParams;
}


function displayValues(params: GpxMiniatureParams) {
  for(const input of inputs) {
    const label = input.nextElementSibling as HTMLInputElement;
    const unit = input.getAttribute("data-unit") ?? 'mm';
    if(label && label.classList.contains('value-display')) {
      label.value = `${input.value}`;
    }
  }
  // Also pop the polyline color on the root so we can use in css for site accent color
  document.documentElement.style.setProperty('--color', params.polylineColor);
}

function handleInput(e: Event) {
  // Early return if controls is null
  if (!controls) {
    console.error('Controls element not found');
    return;
  }

  // If someone types into a valueDisplay, update the input
  if((e.target as HTMLElement).classList.contains('value-display')) {
    const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
    input.value = (e.target as HTMLInputElement).value;
  }
  
  // Parse form data and merge with current state to preserve GPX data
  const data = new FormData(controls);
  const formParams = parseFormData(data);
  
  // Explicitly handle the slantedTextPlate checkbox
  const slantedTextPlateCheckbox = document.getElementById('slantedTextPlate') as HTMLInputElement;
  formParams.slantedTextPlate = slantedTextPlateCheckbox.checked;
  
  // Merge form parameters with current state, preserving GPX data
  currentGpxParams = {
    ...currentGpxParams,
    ...formParams
  };
  
  displayValues(currentGpxParams);
  
  // Send parameters to worker instead of calling updateMiniature directly
  worker.postMessage(currentGpxParams);
}

// Enable form handling
controls?.addEventListener("input", handleInput);
controls?.addEventListener("change", handleInput); // Also listen for change events (important for checkboxes)

// On page load, restore state from defaults
function restoreState() {
  // Restore any params from the current state
  for(const [key, value] of Object.entries(currentGpxParams)) {
    const input = document.getElementById(key) as HTMLInputElement;
    if(input) {
      if(input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else {
        input.value = value.toString();
      }
    }
  }
  // Update display values and send to worker
  displayValues(currentGpxParams);
  worker.postMessage(currentGpxParams);
}

// Enable state restoration
restoreState();

// GPX file handling
const gpxFileInput = document.getElementById('gpxFile') as HTMLInputElement;
const importGpxButton = document.getElementById('importGpxButton') as HTMLButtonElement;

importGpxButton.addEventListener('click', () => {
  gpxFileInput.click();
});

gpxFileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, 'text/xml');

  // Get all track points using local-name()
  const trackPoints = xmlDoc.evaluate(
    '//*[local-name()="trkpt"]',
    xmlDoc,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  const latLngValues: [number, number][] = [];
  const elevationValues: number[] = [];

  // Extract lat/lon and elevation data
  for (let i = 0; i < trackPoints.snapshotLength; i++) {
    const trkpt = trackPoints.snapshotItem(i) as Element;
    const lat = parseFloat(trkpt.getAttribute('lat') || '0');
    const lon = parseFloat(trkpt.getAttribute('lon') || '0');
    const ele = parseFloat(trkpt.querySelector('ele')?.textContent || '0');

    if (!isNaN(lat) && !isNaN(lon) && !isNaN(ele)) {
      latLngValues.push([lat, lon]);
      elevationValues.push(ele);
    }
  }

  // Trim arrays if they exceed MAX_GPX_POINTS
  if (latLngValues.length > MAX_GPX_POINTS) {
    // TODO we might be able to use a better algorithm here than the LLM came up with
    const step = Math.floor(latLngValues.length / MAX_GPX_POINTS);
    const trimmedLatLng = latLngValues.filter((_, i) => i % step === 0).slice(0, MAX_GPX_POINTS);
    const trimmedElevation = elevationValues.filter((_, i) => i % step === 0).slice(0, MAX_GPX_POINTS);

    // Update global state with trimmed data
    currentGpxParams = {
      ...currentGpxParams,
      latLngValues: trimmedLatLng,
      elevationValues: trimmedElevation
    };
  } else {
    // Update global state with the original data
    currentGpxParams = {
      ...currentGpxParams,
      latLngValues,
      elevationValues
    };
  }

  // Send updated parameters to worker
  worker.postMessage(currentGpxParams);
});

const exportButton = document.getElementById("export-button") as HTMLButtonElement;
exportButton.addEventListener("click", async  () => {
  const model = await createGpxMiniatureForExport(currentGpxParams);
  const dimensions = `${currentGpxParams.width}x${currentGpxParams.plateDepth}x${currentGpxParams.thickness}`;
  const blob = await exportTo3MF(model, dimensions);
  const url = URL.createObjectURL(blob);
  // download the blob
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentGpxParams.title}.3mf`;
  a.click();
});