import { exportTo3MF } from './export';
import { setupPreview } from "./preview";
import { createGpxMiniatureForExport, defaultParams, GpxMiniatureParams } from "./gpx-miniature";

const MAX_GPX_POINTS = 200;

// Global state for current parameters
let currentGpxParams: GpxMiniatureParams = { ...defaultParams };

// Initialize the preview
const canvas = document.getElementById("preview") as HTMLCanvasElement;
const updateMiniature = setupPreview(canvas);

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

// Create debounced version of updateMiniature
const debouncedUpdateMiniature = debounce(updateMiniature, 150);

const controls = document.querySelector<HTMLFormElement>("#controls");

// Get all range inputs
const inputs = Array.from(controls?.querySelectorAll<HTMLInputElement>("input") ?? []).filter(input => !input.classList.contains('value-display'));
// todo - I have a tip somewhere on an easy way to split this into two arrays
const displayInputs = Array.from(controls?.querySelectorAll<HTMLInputElement>("input") ?? []).filter(input => input.classList.contains('value-display'));


function parseFormData(data: FormData) {
  const params: Record<string, any> = {};
  for(const [key, value] of data.entries()) {
    // First see if it's a checkbox
    if(value === "on") {
      params[key] = true;
    } else {
      const maybeNumber = parseFloat(value);
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

// Handle continuous input (like dragging sliders) - updates UI immediately but doesn't trigger 3D rendering
function handleContinuousInput(e: Event) {
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
  
  // Update display values immediately for responsive UI
  displayValues(currentGpxParams);
}

// Handle final changes (like releasing sliders, checkbox changes) - triggers 3D rendering
function handleFinalChange(e: Event) {
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
  
  // Update display values immediately for consistency
  displayValues(currentGpxParams);
  
  // Use debounced version for expensive 3D rendering
  debouncedUpdateMiniature(currentGpxParams);
}

// Enable form handling with separated event listeners
controls.addEventListener("input", handleContinuousInput);
controls.addEventListener("change", handleFinalChange);

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
  // Update display values and miniature directly (no debouncing on initial load)
  displayValues(currentGpxParams);
  updateMiniature(currentGpxParams);
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
    const lat = parseFloat(trkpt.getAttribute('lat'));
    const lon = parseFloat(trkpt.getAttribute('lon'));
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

  // Use non-debounced version for immediate feedback on file import
  updateMiniature(currentGpxParams);
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