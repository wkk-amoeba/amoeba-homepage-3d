/**
 * Unified Sphere effect: a single shape that transitions between two effects
 * based on scroll position, using per-particle position lerp during transitions.
 *
 * Sub-section layout (within the Sphere's sectionSpan scroll range):
 *   [0.0, boundary]  → Deform (breathing/crumple)
 *   [boundary, 1.0]  → Metaball Linear Split (위성 직선 왕복 + 리퀴드 브릿지)
 *
 * During the boundary (±transitionWidth), both effects run simultaneously
 * and their output positions are lerped per-particle.
 */

import type { SphereDeformConfig } from './sphereDeform';
import type { MetaballLinearConfig } from './sphereMetaball';
import { fbm, metaballField, makeLinearDirections } from './sphereMath';
import type { LinearDir } from './sphereMath';

// ─── Effect compute functions ───

function computeDeform(
  output: Float32Array, count: number,
  normals: Float32Array, radii: Float32Array,
  elapsed: number, config: SphereDeformConfig,
) {
  const breath1 = Math.sin(elapsed * config.breathSpeed);
  const breath2 = Math.sin(elapsed * config.breathSpeed * 0.7 + 1.3);
  const breathRaw = (breath1 * 0.7 + breath2 * 0.3) * 0.5 + 0.5;
  const intensity = config.breathMin + (config.breathMax - config.breathMin) * breathRaw;
  const timeOffset = elapsed * config.noiseSpeed;

  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    const r = radii[i];
    const noiseVal = fbm(
      nx * config.noiseScale + timeOffset,
      ny * config.noiseScale + timeOffset * 0.7,
      nz * config.noiseScale + timeOffset * 0.3,
    );
    const newR = r + (-noiseVal * config.maxDeform * intensity);
    output[i * 3] = nx * newR;
    output[i * 3 + 1] = ny * newR;
    output[i * 3 + 2] = nz * newR;
  }
}

/**
 * Split-particle linear: main particles ray-march from main center,
 * remaining split among satellites (each ray-marches from its own center).
 * Satellites reciprocate along fixed directions — when they approach the main
 * sphere, metaball liquid bridges form; when far, they maintain their own shape.
 */
function computeMetaballLinearSplit(
  output: Float32Array, count: number,
  normals: Float32Array,
  elapsed: number, config: MetaballLinearConfig,
  allDirs: LinearDir[], satCenters: Float64Array,
  mainParticleRatio?: number,
  maxSatZ?: number,
  centerOutput?: Float32Array,
  minSatZ?: number,
) {
  const satCount = Math.min(config.satelliteCount, 8);
  const mainR2 = config.mainRadius * config.mainRadius;
  const satR2 = config.satelliteRadius * config.satelliteRadius;
  const threshold = config.threshold;
  const mainCx = 0;
  const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
  const mainCz = 0;

  const satZMax = maxSatZ ?? config.mainRadius;
  const satZMin = minSatZ ?? -Infinity;
  for (let s = 0; s < satCount; s++) {
    const d = allDirs[s];
    const t = Math.sin(elapsed * config.travelSpeed * d.speedMul + d.phase);
    const dist = config.travelDistance * t;
    satCenters[s * 3] = mainCx + d.dir[0] * dist;
    satCenters[s * 3 + 1] = mainCy + d.dir[1] * dist;
    satCenters[s * 3 + 2] = Math.max(satZMin, Math.min(mainCz + d.dir[2] * dist, satZMax));
  }

  const mainFraction = mainParticleRatio ?? (mainR2 / (mainR2 + satCount * satR2));
  const mainParticleEnd = Math.floor(count * mainFraction);

  // Main sphere particles: ray-march from main center
  for (let i = 0; i < mainParticleEnd; i++) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let tLow = 0.05, tHigh = config.mainRadius * 4;
    const fHigh = metaballField(
      mainCx + nx * tHigh, mainCy + ny * tHigh, mainCz + nz * tHigh,
      mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount,
    );
    if (fHigh >= threshold) {
      output[i * 3] = mainCx + nx * tHigh;
      output[i * 3 + 1] = mainCy + ny * tHigh;
      output[i * 3 + 2] = mainCz + nz * tHigh;
      if (centerOutput) {
        centerOutput[i * 3] = mainCx;
        centerOutput[i * 3 + 1] = mainCy;
        centerOutput[i * 3 + 2] = mainCz;
      }
      continue;
    }
    for (let iter = 0; iter < 8; iter++) {
      const tMid = (tLow + tHigh) * 0.5;
      const f = metaballField(
        mainCx + nx * tMid, mainCy + ny * tMid, mainCz + nz * tMid,
        mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount,
      );
      if (f > threshold) tLow = tMid; else tHigh = tMid;
    }
    const t = (tLow + tHigh) * 0.5;
    output[i * 3] = mainCx + nx * t;
    output[i * 3 + 1] = mainCy + ny * t;
    output[i * 3 + 2] = mainCz + nz * t;
    if (centerOutput) {
      centerOutput[i * 3] = mainCx;
      centerOutput[i * 3 + 1] = mainCy;
      centerOutput[i * 3 + 2] = mainCz;
    }
  }

  // Satellite particles: interleaved assignment + linear scan for first surface crossing
  const satFallbackR = config.satelliteRadius / Math.sqrt(threshold);
  const scanRange = Math.max(config.satelliteRadius * 4, config.mainRadius * 3);
  const scanSteps = 20;
  const scanDt = scanRange / scanSteps;

  for (let i = mainParticleEnd; i < count; i++) {
    const s = (i - mainParticleEnd) % satCount;
    const scx = satCenters[s * 3];
    const scy = satCenters[s * 3 + 1];
    const scz = satCenters[s * 3 + 2];

    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];

    let crossLow = -1, crossHigh = -1;
    for (let step = 1; step <= scanSteps; step++) {
      const t = scanDt * step;
      const f = metaballField(
        scx + nx * t, scy + ny * t, scz + nz * t,
        mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount,
      );
      if (f < threshold) {
        crossLow = scanDt * (step - 1);
        crossHigh = t;
        break;
      }
    }

    if (crossLow < 0) {
      output[i * 3] = scx + nx * satFallbackR;
      output[i * 3 + 1] = scy + ny * satFallbackR;
      output[i * 3 + 2] = scz + nz * satFallbackR;
      if (centerOutput) {
        centerOutput[i * 3] = scx;
        centerOutput[i * 3 + 1] = scy;
        centerOutput[i * 3 + 2] = scz;
      }
      continue;
    }

    let tLow = Math.max(0.05, crossLow), tHigh = crossHigh;
    for (let iter = 0; iter < 6; iter++) {
      const tMid = (tLow + tHigh) * 0.5;
      const f = metaballField(
        scx + nx * tMid, scy + ny * tMid, scz + nz * tMid,
        mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount,
      );
      if (f > threshold) tLow = tMid; else tHigh = tMid;
    }
    const tF = (tLow + tHigh) * 0.5;

    output[i * 3] = scx + nx * tF;
    output[i * 3 + 1] = scy + ny * tF;
    output[i * 3 + 2] = scz + nz * tF;
    if (centerOutput) {
      centerOutput[i * 3] = scx;
      centerOutput[i * 3 + 1] = scy;
      centerOutput[i * 3 + 2] = scz;
    }
  }
}

// ─── Morpher 타입 ───

type MorpherAPI = {
  getShapeTargets: () => { positions: Float32Array; activeCount: number; holdScatter: number; lighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number }; particleCenters?: Float32Array; usePerParticleCenter?: number }[];
  setShapeUpdater: (idx: number, fn: (delta: number, scrollProgress: number) => void) => void;
  getSectionBounds: (idx: number) => { start: number; end: number } | null;
};

// ─── 씬1: Deform (breathing/crumple) ───

export function registerSphereDeform(morpher: MorpherAPI, shapeIdx: number) {
  const shape = morpher.getShapeTargets()[shapeIdx];
  if (!shape) { console.warn(`registerSphereDeform: shape ${shapeIdx} not found`); return; }

  const positions = shape.positions;
  const count = shape.activeCount;
  const normals = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ox = positions[i*3], oy = positions[i*3+1], oz = positions[i*3+2];
    const r = Math.sqrt(ox*ox + oy*oy + oz*oz);
    radii[i] = r;
    if (r > 0.001) { normals[i*3] = ox/r; normals[i*3+1] = oy/r; normals[i*3+2] = oz/r; }
  }

  const deformConfig: SphereDeformConfig = {
    noiseScale: 3.4, maxDeform: 0, breathSpeed: 1.8,
    breathMin: 0.7, breathMax: 1.0, noiseSpeed: 0.25,
  };

  let elapsed = 0;
  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    elapsed += delta;
    computeDeform(positions, count, normals, radii, elapsed, deformConfig);
  });
}

// ─── 씬2: Orbital (위성 궤도) ───

export function registerSphereOrbital(morpher: MorpherAPI, shapeIdx: number) {
  const shape = morpher.getShapeTargets()[shapeIdx];
  if (!shape) { console.warn(`registerSphereOrbital: shape ${shapeIdx} not found`); return; }

  const positions = shape.positions;
  const count = shape.activeCount;
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ox = positions[i*3], oy = positions[i*3+1], oz = positions[i*3+2];
    const r = Math.sqrt(ox*ox + oy*oy + oz*oz);
    if (r > 0.001) { normals[i*3] = ox/r; normals[i*3+1] = oy/r; normals[i*3+2] = oz/r; }
  }

  const orbitalConfig: MetaballLinearConfig = {
    mainRadius: 1.00, bobAmplitude: 0.75, bobSpeed: 1.1,
    satelliteCount: 5, satelliteRadius: 0.2,
    travelDistance: 2.0, travelSpeed: 0.8, threshold: 1.05,
  };
  const mainParticleRatio = 0.80;
  const maxSatZ = 0;
  const minSatZ = -1.0;
  const allLinearDirs = makeLinearDirections(8);
  const satCenters = new Float64Array(8 * 3);
  const centerBuf = new Float32Array(count * 3);

  let elapsed = 0;
  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    elapsed += delta;
    computeMetaballLinearSplit(positions, count, normals, elapsed, orbitalConfig, allLinearDirs, satCenters, mainParticleRatio, maxSatZ, centerBuf, minSatZ);
    shape.particleCenters = centerBuf;
    shape.usePerParticleCenter = 1;
  });
}
