import { getManifoldInstance } from './manifold-instance';
import { create3DText } from './text-3d';
import type { Manifold } from 'manifold-3d';

export interface GpxMiniatureParams {
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

interface GpxMiniatureComponents {
  base: Manifold;
  polyline: Manifold;
  text: Manifold;
}

function halfAngleDifference(a2: number, a1: number): number {
  if (Math.abs(a2 - a1) < 180) return (a2 - a1) / 2;
  if (Math.abs(a2 - a1 - 360) < 180) return (a2 - a1 - 360) / 2;
  return (a2 - a1 + 360) / 2;
}

async function createSlantedSegment(edgeLen: number, edgeWidth: number, h0: number, h1: number) {
  const { Manifold, CrossSection } = await getManifoldInstance();
  
  // Create a cross section of the trapezoidal shape
  const crossSection = new CrossSection([
    [0, 0],       // bottom left
    [edgeLen, 0], // bottom right
    [edgeLen, h1], // top right
    [0, h0]       // top left
  ]);

  // Extrude up Z, rotate to the proper orientation (+Z resting on thy XY plane),
  // and then translate to center on X axis.
  return crossSection.extrude(edgeWidth).rotate([90, 0, 0]).translate([0, edgeWidth/2, 0]);
}

async function createMapPolyline(params: GpxMiniatureParams, scaledPoints: { x: number, y: number }[], elevation: number[]) {
  const { Manifold } = await getManifoldInstance();
  
  const maxIdx = Math.round((params.truncatePct / 100) * scaledPoints.length - 1);
  const elevationMin = Math.min(...elevation);
  const elevationDiff = Math.max(...elevation) - elevationMin;
  const mapPolylineHeight = params.maxPolylineHeight - 1;

  const scaledElevation = elevation.map(e => 
    1 + (e - elevationMin) * 0.95 * mapPolylineHeight / elevationDiff + 0.05 * mapPolylineHeight
  );

  const parts: any[] = [];
  
  for (let i = 0; i < maxIdx - 1; i++) {
    const p0 = scaledPoints[i];
    const p1 = scaledPoints[i + 1];
    const h0 = scaledElevation[i];
    const h1 = scaledElevation[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    const dxPrev = i > 0 ? p0.x - scaledPoints[i - 1].x : 0;
    const dyPrev = i > 0 ? p0.y - scaledPoints[i - 1].y : 0;
    const dxNext = i < maxIdx - 1 ? scaledPoints[i + 2].x - p1.x : 0;
    const dyNext = i < maxIdx - 1 ? scaledPoints[i + 2].y - p1.y : 0;

    const edgeWidth = 1;
    const edgeLen = Math.sqrt(dx * dx + dy * dy) + 0.01;
    
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const anglePrev = Math.atan2(dyPrev, dxPrev) * 180 / Math.PI;
    const angleNext = Math.atan2(dyNext, dxNext) * 180 / Math.PI;

    // Create the slanted segment
    let segment = await createSlantedSegment(edgeLen, edgeWidth, h0, h1);

    // Create cutting planes for joints
    if (i < maxIdx - 1) {
      const nextCutter = Manifold.cube([edgeWidth, edgeWidth * 4, mapPolylineHeight + 2])
        .translate([0, -2 * edgeWidth, -1])
        .rotate([0, 0, halfAngleDifference(angleNext, angle)])
        .translate([edgeLen, 0, 0]);
      segment = segment.subtract(nextCutter);
    }

    if (i > 0) {
      const prevCutter = Manifold.cube([edgeWidth, edgeWidth * 4, mapPolylineHeight + 2])
        .translate([0, -2 * edgeWidth, -1])
        .rotate([0, 0, 180 - halfAngleDifference(angle, anglePrev)]);
      segment = segment.subtract(prevCutter);
    }

    // Transform segment to world position
    segment = segment.rotate([0, 0, angle]).translate([p0.x, p0.y, 0]);
    parts.push(segment);

    // Create joint cylinder
    let joint = Manifold.cylinder(h0, edgeWidth/2, edgeWidth/2, 12);

    // Cut joint with segment planes
    const segmentCutter = Manifold.cube([edgeWidth, edgeWidth + 2, mapPolylineHeight + 0.002])
      .translate([0.001, -(edgeWidth + 2) / 2, -0.001])
      .rotate([0, 0, angle]);
    joint = joint.subtract(segmentCutter);

    if (i > 0) {
      const prevSegmentCutter = Manifold.cube([edgeWidth, edgeWidth + 2, mapPolylineHeight + 0.002])
        .translate([0.001, -(edgeWidth + 2) / 2, -0.001])
        .rotate([0, 0, 180 + anglePrev]);
      joint = joint.subtract(prevSegmentCutter);
    }

    // Transform joint to world position
    joint = joint.translate([p0.x, p0.y, 0]);
    parts.push(joint);

    // Add final cylinder at the end of the last segment
    if (i === maxIdx - 2) {
      let finalJoint = Manifold.cylinder(h1, edgeWidth/2, edgeWidth/2, 12);
      const finalCutter = Manifold.cube([edgeWidth, edgeWidth + 2, mapPolylineHeight + 0.002])
        .translate([0.001, -(edgeWidth + 2) / 2, -0.001])
        .rotate([0, 0, 180 + angle]);
      finalJoint = finalJoint.subtract(finalCutter);
      finalJoint = finalJoint.translate([p1.x, p1.y, 0]);
      parts.push(finalJoint);
    }
  }

  return parts.length > 0 ? Manifold.union(parts) : new Manifold();
}

async function createTextPlate(params: GpxMiniatureParams): Promise<{ plate: Manifold, text: Manifold }> {
  const { Manifold } = await getManifoldInstance();
  
  let textSurface: Manifold;
  let text: Manifold;

  // Create the text first to get its dimensions
  const rawText = await create3DText(params.title, {
    fontSize: params.fontSize,
    thickness: params.textThickness
  });

  if (!rawText || rawText.isEmpty()) {
    // If text creation failed, return empty text
    text = new Manifold();
    // Create flat text plate
    textSurface = Manifold.cube([params.width, params.plateDepth, params.thickness]);
  } else {
    // Get the bounding box of the text to calculate centering
    const textBounds = rawText.boundingBox();
    const textWidth = textBounds.max[0] - textBounds.min[0];
    const textHeight = textBounds.max[1] - textBounds.min[1];
    
    // Calculate the X position to center the text horizontally
    const centeredX = (params.width - textWidth) / 2;

    if (params.slantedTextPlate) {
      // Create slanted text plate (existing behavior)
      const angle = Math.atan(params.thickness / params.plateDepth) * 180 / Math.PI;
      const centeredY = (Math.sqrt(params.plateDepth * params.plateDepth + params.thickness * params.thickness) - textHeight) / 2;

      // Create angled text surface by intersecting
      textSurface = Manifold.intersection(
        Manifold.cube([params.width, params.plateDepth, params.thickness]),
        Manifold.cube([params.width, 2 * params.plateDepth, params.thickness])
          .translate([0, 0, -params.thickness])
          .rotate([angle, 0, 0])
      );

      // Create text with rotation and centering
      text = rawText
        .translate([centeredX, centeredY, 0])
        .rotate([angle, 0, 0]);
    } else {
      const centeredY = (params.plateDepth - textHeight) / 2;
      // Create flat text plate
      textSurface = Manifold.cube([params.width, params.plateDepth, params.thickness]);

      // Create text without rotation but with centering
      text = rawText
        .translate([centeredX, centeredY, params.thickness]);
    }
  }

  return { plate: textSurface, text };
}

export async function createGpxMiniatureComponents(params: GpxMiniatureParams): Promise<GpxMiniatureComponents> {
  const { Manifold } = await getManifoldInstance();
  
  const maxSize = params.width - 2 * params.margin;
  
  // Convert lat/lng to points
  const points = params.latLngValues.map(([lat, lng]) => ({ x: lng, y: lat }));
  
  // Rotate all points about the origin to account for mapRotation
  const rotationRad = params.mapRotation * Math.PI / 180;
  const rotatedPoints = points.map(p => ({
    x: p.x * Math.cos(rotationRad) - p.y * Math.sin(rotationRad),
    y: p.x * Math.sin(rotationRad) + p.y * Math.cos(rotationRad)
  }));
  
  // Calculate bounds using rotated points
  const pointsX = rotatedPoints.map(p => p.x);
  const pointsY = rotatedPoints.map(p => p.y);
  const pointsXMin = Math.min(...pointsX);
  const pointsYMin = Math.min(...pointsY);
  
  const pointsWidth = Math.max(...pointsX) - pointsXMin;
  const pointsHeight = Math.max(...pointsY) - pointsYMin;
  
  // Calculate scale based on the rotated bounding box
  const scale = maxSize / Math.max(pointsWidth, pointsHeight);
  
  // Scale points using rotated points
  const scaledPoints = rotatedPoints.map(p => ({
    x: (p.x - pointsXMin) * scale,
    y: (p.y - pointsYMin) * scale
  }));
  
  // Create base plate
  const basePlate = Manifold.cube([params.width, params.width, params.thickness])
    .translate([0, params.plateDepth, 0]);
  
  // Create text plate and text
  const { plate: textPlate, text } = await createTextPlate(params);

  // Combine base and text plate
  const base = Manifold.union([basePlate, textPlate]);

  // Create map polyline
  const polyline = await createMapPolyline(params, scaledPoints, params.elevationValues);
  
  // Calculate translation to center the already rotated and scaled polyline
  const translateX = (params.margin + (params.width - 2 * params.margin) / 2) - (pointsWidth * scale / 2);
  const translateY = (params.plateDepth + params.margin + (params.width - 2 * params.margin) / 2) - (pointsHeight * scale / 2);
  
  const transformedPolyline = polyline
    .translate([translateX, translateY, params.thickness - 0.001]);

  return { base, polyline: transformedPolyline, text };
}

export async function createGpxMiniatureForExport(params: GpxMiniatureParams): Promise<Manifold> {
  const { Manifold } = await getManifoldInstance();

  const components = await createGpxMiniatureComponents(params);
  return Manifold.union([components.base, components.polyline, components.text]);
}

export const defaultParams: GpxMiniatureParams = {
  title: "Lookout MTN",
  fontSize: 5.5,
  truncatePct: 100,
  mapRotation: -109,
  elevationValues: [1829,1830.4,1833.4,1836.8,1839.4,1842.4,1846.2,1849.6,1853,1855.4,1859,1861.8,1865.2,1869.8,1874,1876.6,1880,1884,1888.8,1891.4,1894,1897.2,1901.2,1903.8,1906.8,1910.4,1913.8,1916.2,1920.4,1923.2,1924.6,1926.2,1929.2,1932.4,1935.2,1939.4,1943.6,1947.2,1950,1954.2,1957.6,1961.4,1966.6,1972.2,1975,1979.6,1982.8,1986.6,1990,1991.4,1995.4,1999.8,2003.6,2007.8,2012.2,2015.2,2018.4,2021.4,2025.8,2029.6,2032,2035,2037.4,2040.6,2042.8,2045.4,2048.2,2052,2056.2,2061.4,2064.8,2068.2,2072.4,2076.2,2079.4,2082.6,2086.6,2091.8,2094.6,2097.8,2102.2,2105.6,2109.8,2113.8,2116.2,2120,2122.4,2125.6,2127.2,2131,2134.8,2138.4,2142.6,2146.2,2150.4,2154.4,2158.4,2162,2166.2,2170,2173.6,2177.2,2180.6,2185.4,2189.2,2191.2,2195.4,2198.4,2198.8,2195.2,2195.4,2199.6,2203,2206.2,2208.6,2209.2],
  latLngValues: [[39.74196,-105.228133],[39.741681,-105.228322],[39.741212,-105.22814],[39.740646,-105.227904],[39.740081,-105.227605],[39.740327,-105.228214],[39.740508,-105.228985],[39.740515,-105.229573],[39.740343,-105.230126],[39.740392,-105.230611],[39.740898,-105.230902],[39.741123,-105.23138],[39.741335,-105.231962],[39.741933,-105.232603],[39.742506,-105.233101],[39.74285,-105.233496],[39.742922,-105.234117],[39.742996,-105.23494],[39.743493,-105.234664],[39.743965,-105.234488],[39.74437,-105.234637],[39.744592,-105.235134],[39.744493,-105.235857],[39.744574,-105.236373],[39.744932,-105.236202],[39.745474,-105.235973],[39.745973,-105.236169],[39.746335,-105.236627],[39.746867,-105.236922],[39.747242,-105.236961],[39.7474,-105.237199],[39.747446,-105.237501],[39.74758,-105.238137],[39.748079,-105.238194],[39.748481,-105.238204],[39.749108,-105.238724],[39.749436,-105.239362],[39.749382,-105.239975],[39.749278,-105.240515],[39.748777,-105.241252],[39.748605,-105.242141],[39.748685,-105.242897],[39.748812,-105.243818],[39.748894,-105.244754],[39.748461,-105.243931],[39.748167,-105.242957],[39.747976,-105.24247],[39.748021,-105.243486],[39.748045,-105.244242],[39.74779,-105.243796],[39.74753,-105.242718],[39.747544,-105.241932],[39.747936,-105.241263],[39.748094,-105.240511],[39.74779,-105.239973],[39.747257,-105.240005],[39.746839,-105.239715],[39.746234,-105.239699],[39.745586,-105.239185],[39.74495,-105.239067],[39.744294,-105.239262],[39.743804,-105.239758],[39.743111,-105.24003],[39.742603,-105.239523],[39.742048,-105.23941],[39.74127,-105.239837],[39.740924,-105.24069],[39.740643,-105.241687],[39.740217,-105.242365],[39.739655,-105.242966],[39.739017,-105.242812],[39.738623,-105.243077],[39.738061,-105.243674],[39.737721,-105.244187],[39.737441,-105.24478],[39.737187,-105.245242],[39.736635,-105.245165],[39.736034,-105.24455],[39.735602,-105.244362],[39.735108,-105.244439],[39.73447,-105.244547],[39.733857,-105.244538],[39.733308,-105.244523],[39.733519,-105.244814],[39.733847,-105.244749],[39.73361,-105.245092],[39.733269,-105.245124],[39.733494,-105.24538],[39.73389,-105.245285],[39.734518,-105.245286],[39.735119,-105.245388],[39.735412,-105.245788],[39.734741,-105.245777],[39.734192,-105.245997],[39.733603,-105.246227],[39.733059,-105.245989],[39.732561,-105.245511],[39.732119,-105.24478],[39.732003,-105.243841],[39.731703,-105.2435],[39.73168,-105.242913],[39.732304,-105.242448],[39.732756,-105.241963],[39.7329,-105.241],[39.732671,-105.240391],[39.732915,-105.240097],[39.733654,-105.239772],[39.734017,-105.239175],[39.733583,-105.238201],[39.732881,-105.237396],[39.731871,-105.23737],[39.731584,-105.238008],[39.731717,-105.23915],[39.732121,-105.239537],[39.732752,-105.239478],[39.73359,-105.239065]],
  width: 50,
  plateDepth: 10,
  thickness: 5,
  textThickness: 1.6,
  margin: 2.5,
  maxPolylineHeight: 20,
  baseColor: "#1a1a1a",
  polylineColor: "#fc5200",
  slantedTextPlate: true
};