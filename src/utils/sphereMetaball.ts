/**
 * Sphere2 metaball effect: a main sphere bobs up/down while satellite
 * spheres orbit around it. When satellites approach the main sphere,
 * particles form liquid-like bridges (metaball isosurface).
 *
 * Uses implicit surface ray-marching: for each particle's radial direction,
 * find the metaball isosurface via bisection search.
 */

/** Runtime-adjustable metaball parameters */
export interface MetaballConfig {
  mainRadius: number;        // 메인 구 반경 (정규화 유닛)
  bobAmplitude: number;      // Y 상하 운동 진폭
  bobSpeed: number;          // 상하 운동 속도 (rad/s)
  satelliteCount: number;    // 위성 구 개수
  satelliteRadius: number;   // 위성 구 반경
  orbitRadius: number;       // 궤도 반경 (메인 구 표면으로부터)
  orbitSpeed: number;        // 궤도 속도 (rad/s)
  threshold: number;         // isosurface 임계값
}

/** Module-level active config for DebugPanel */
let activeMetaballConfig: MetaballConfig | null = null;
export function getActiveMetaballConfig(): MetaballConfig | null {
  return activeMetaballConfig;
}

// Satellite orbit definitions (fixed axes for variety)
interface Satellite {
  // Orbit plane defined by two orthogonal axes
  ax1: [number, number, number]; // first axis
  ax2: [number, number, number]; // second axis
  phaseOffset: number;           // initial angle offset
  speedMul: number;              // speed multiplier (variation)
}

function makeSatellites(count: number): Satellite[] {
  const satellites: Satellite[] = [];
  for (let i = 0; i < count; i++) {
    const phi = (i / count) * Math.PI; // distribute orbit planes
    const theta = (i / count) * Math.PI * 2 * 0.618; // golden angle spread

    // Create a tilted orbit plane
    const ax1: [number, number, number] = [
      Math.cos(theta),
      Math.sin(phi) * 0.3, // slight vertical tilt
      Math.sin(theta),
    ];
    const ax2: [number, number, number] = [
      -Math.sin(theta) * Math.cos(phi),
      Math.cos(phi),
      Math.cos(theta) * Math.cos(phi),
    ];

    // Normalize axes
    const len1 = Math.sqrt(ax1[0] ** 2 + ax1[1] ** 2 + ax1[2] ** 2);
    const len2 = Math.sqrt(ax2[0] ** 2 + ax2[1] ** 2 + ax2[2] ** 2);
    ax1[0] /= len1; ax1[1] /= len1; ax1[2] /= len1;
    ax2[0] /= len2; ax2[1] /= len2; ax2[2] /= len2;

    satellites.push({
      ax1,
      ax2,
      phaseOffset: (i / count) * Math.PI * 2,
      speedMul: 0.7 + (i % 3) * 0.3, // 0.7, 1.0, 1.3 variation
    });
  }
  return satellites;
}

/** Evaluate metaball field at point (px, py, pz) */
function metaballField(
  px: number, py: number, pz: number,
  mainCx: number, mainCy: number, mainCz: number, mainR2: number,
  satCenters: Float64Array, satR2: number, satCount: number,
): number {
  // Main sphere contribution
  const dx0 = px - mainCx;
  const dy0 = py - mainCy;
  const dz0 = pz - mainCz;
  const dist2_main = dx0 * dx0 + dy0 * dy0 + dz0 * dz0;
  let field = mainR2 / (dist2_main + 0.0001);

  // Satellite contributions
  for (let s = 0; s < satCount; s++) {
    const sx = satCenters[s * 3];
    const sy = satCenters[s * 3 + 1];
    const sz = satCenters[s * 3 + 2];
    const dx = px - sx;
    const dy = py - sy;
    const dz = pz - sz;
    const dist2 = dx * dx + dy * dy + dz * dz;
    field += satR2 / (dist2 + 0.0001);
  }

  return field;
}

/**
 * Register a metaball updater on a ParticleMorpher shape.
 * Returns the config object for runtime adjustment.
 */
export function registerSphereMetaball(
  morpher: {
    getShapeTargets: () => { positions: Float32Array }[];
    setShapeUpdater: (idx: number, fn: (delta: number) => void) => void;
  },
  shapeIdx: number,
  options: Partial<MetaballConfig> = {},
): MetaballConfig | null {
  const shapeTargets = morpher.getShapeTargets();
  const shape = shapeTargets[shapeIdx];
  if (!shape) {
    console.warn(`registerSphereMetaball: shape index ${shapeIdx} not found`);
    return null;
  }

  const config: MetaballConfig = {
    mainRadius: options.mainRadius ?? 0.5,
    bobAmplitude: options.bobAmplitude ?? 0,
    bobSpeed: options.bobSpeed ?? 1.2,
    satelliteCount: options.satelliteCount ?? 1,
    satelliteRadius: options.satelliteRadius ?? 0.1,
    orbitRadius: options.orbitRadius ?? 0.5,
    orbitSpeed: options.orbitSpeed ?? 0.6,
    threshold: options.threshold ?? 0.5,
  };

  const positions = shape.positions;
  const count = positions.length / 3;

  // Store original positions and precompute directions
  const originalPositions = new Float32Array(positions);
  const normals = new Float32Array(count * 3);
  const radii = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];
    const r = Math.sqrt(ox * ox + oy * oy + oz * oz);
    radii[i] = r;
    if (r > 0.001) {
      normals[i * 3] = ox / r;
      normals[i * 3 + 1] = oy / r;
      normals[i * 3 + 2] = oz / r;
    }
  }

  // Average radius for reference
  let avgRadius = 0;
  for (let i = 0; i < count; i++) avgRadius += radii[i];
  avgRadius /= count;

  // Pre-create satellite orbit definitions (max 8)
  const allSatellites = makeSatellites(8);

  // Preallocate satellite centers array
  const satCenters = new Float64Array(8 * 3);

  let elapsed = 0;

  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    elapsed += delta;

    const satCount = Math.min(config.satelliteCount, 8);
    const mainR = config.mainRadius;
    const mainR2 = mainR * mainR;
    const satR = config.satelliteRadius;
    const satR2 = satR * satR;

    // Main sphere center (bobbing)
    const mainCx = 0;
    const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
    const mainCz = 0;

    // Update satellite positions
    for (let s = 0; s < satCount; s++) {
      const sat = allSatellites[s];
      const angle = elapsed * config.orbitSpeed * sat.speedMul + sat.phaseOffset;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const orbR = config.orbitRadius + mainR;

      satCenters[s * 3] = mainCx + (sat.ax1[0] * cosA + sat.ax2[0] * sinA) * orbR;
      satCenters[s * 3 + 1] = mainCy + (sat.ax1[1] * cosA + sat.ax2[1] * sinA) * orbR;
      satCenters[s * 3 + 2] = mainCz + (sat.ax1[2] * cosA + sat.ax2[2] * sinA) * orbR;
    }

    // For each particle, find the metaball isosurface along its direction
    const threshold = config.threshold;

    for (let i = 0; i < count; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      // Bisection search along ray from origin in direction n̂
      // Search range: [0.05, avgRadius * 3]
      let tLow = 0.05;
      let tHigh = avgRadius * 3;

      // Check if isosurface exists along this ray
      const fHigh = metaballField(
        nx * tHigh, ny * tHigh, nz * tHigh,
        mainCx, mainCy, mainCz, mainR2,
        satCenters, satR2, satCount,
      );

      if (fHigh >= threshold) {
        // Field is still above threshold at tHigh — surface is beyond range
        // Place particle at tHigh (or skip)
        positions[i * 3] = nx * tHigh;
        positions[i * 3 + 1] = ny * tHigh;
        positions[i * 3 + 2] = nz * tHigh;
        continue;
      }

      // Bisection: find t where field ≈ threshold
      // Field decreases as t increases (moving away from centers)
      for (let iter = 0; iter < 8; iter++) {
        const tMid = (tLow + tHigh) * 0.5;
        const px = nx * tMid;
        const py = ny * tMid;
        const pz = nz * tMid;

        const f = metaballField(
          px, py, pz,
          mainCx, mainCy, mainCz, mainR2,
          satCenters, satR2, satCount,
        );

        if (f > threshold) {
          tLow = tMid; // inside surface, move outward
        } else {
          tHigh = tMid; // outside surface, move inward
        }
      }

      const t = (tLow + tHigh) * 0.5;
      positions[i * 3] = nx * t;
      positions[i * 3 + 1] = ny * t;
      positions[i * 3 + 2] = nz * t;
    }
  });

  activeMetaballConfig = config;
  return config;
}

// ─── Sphere3: Linear reciprocating satellites ───

/** Config for linear reciprocating metaball */
export interface MetaballLinearConfig {
  mainRadius: number;
  bobAmplitude: number;
  bobSpeed: number;
  satelliteCount: number;
  satelliteRadius: number;
  travelDistance: number;     // 위성 왕복 거리 (중심으로부터)
  travelSpeed: number;       // 왕복 속도
  threshold: number;
}

let activeLinearConfig: MetaballLinearConfig | null = null;
export function getActiveLinearConfig(): MetaballLinearConfig | null {
  return activeLinearConfig;
}

/** Pre-defined linear travel directions (spread in 3D) */
function makeLinearDirections(count: number): { dir: [number, number, number]; phase: number; speedMul: number }[] {
  const dirs: { dir: [number, number, number]; phase: number; speedMul: number }[] = [];
  // Spread directions like the reference image arrows
  const baseDirections: [number, number, number][] = [
    [-0.7, 0.7, 0.1],    // upper-left (blue/purple)
    [0.0, 1.0, 0.0],     // straight up (red - but used for satellite)
    [0.8, 0.5, -0.2],    // upper-right (green/yellow)
    [0.9, -0.1, 0.3],    // right (yellow)
    [-0.8, -0.3, 0.2],   // left (green)
    [-0.3, -0.8, -0.4],  // lower-left
    [0.5, -0.7, 0.5],    // lower-right (blue)
    [0.1, 0.3, -0.9],    // into screen
  ];

  for (let i = 0; i < count && i < baseDirections.length; i++) {
    const d = baseDirections[i];
    const len = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
    dirs.push({
      dir: [d[0] / len, d[1] / len, d[2] / len],
      phase: (i / count) * Math.PI * 2,
      speedMul: 0.6 + (i % 3) * 0.25,
    });
  }
  return dirs;
}

/**
 * Register linear reciprocating metaball for Sphere3.
 * Satellites travel back-and-forth along fixed directions,
 * merging with main sphere when paths cross.
 */
export function registerSphereMetaballLinear(
  morpher: {
    getShapeTargets: () => { positions: Float32Array }[];
    setShapeUpdater: (idx: number, fn: (delta: number) => void) => void;
  },
  shapeIdx: number,
  options: Partial<MetaballLinearConfig> = {},
): MetaballLinearConfig | null {
  const shapeTargets = morpher.getShapeTargets();
  const shape = shapeTargets[shapeIdx];
  if (!shape) {
    console.warn(`registerSphereMetaballLinear: shape index ${shapeIdx} not found`);
    return null;
  }

  const config: MetaballLinearConfig = {
    mainRadius: options.mainRadius ?? 0.7,
    bobAmplitude: options.bobAmplitude ?? 0.75,
    bobSpeed: options.bobSpeed ?? 1.1,
    satelliteCount: options.satelliteCount ?? 5,
    satelliteRadius: options.satelliteRadius ?? 0.2,
    travelDistance: options.travelDistance ?? 1.5,
    travelSpeed: options.travelSpeed ?? 0.8,
    threshold: options.threshold ?? 1.05,
  };

  const positions = shape.positions;
  const count = positions.length / 3;

  // Precompute radial directions (unit sphere normals)
  const normals = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const ox = positions[i * 3];
    const oy = positions[i * 3 + 1];
    const oz = positions[i * 3 + 2];
    const r = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (r > 0.001) {
      normals[i * 3] = ox / r;
      normals[i * 3 + 1] = oy / r;
      normals[i * 3 + 2] = oz / r;
    }
  }

  const allDirs = makeLinearDirections(8);
  const satCenters = new Float64Array(8 * 3);
  let elapsed = 0;

  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    elapsed += delta;

    const satCount = Math.min(config.satelliteCount, 8);
    const mainR = config.mainRadius;
    const mainR2 = mainR * mainR;
    const satR = config.satelliteRadius;
    const satR2 = satR * satR;
    const threshold = config.threshold;

    // Main sphere bobbing
    const mainCx = 0;
    const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
    const mainCz = 0;

    // Update satellite positions
    for (let s = 0; s < satCount; s++) {
      const d = allDirs[s];
      const t = Math.sin(elapsed * config.travelSpeed * d.speedMul + d.phase);
      const dist = config.travelDistance * t;
      satCenters[s * 3] = mainCx + d.dir[0] * dist;
      satCenters[s * 3 + 1] = mainCy + d.dir[1] * dist;
      satCenters[s * 3 + 2] = mainCz + d.dir[2] * dist;
    }

    // Particle allocation: main sphere gets 50%, rest split among satellites
    const mainParticleEnd = Math.floor(count * 0.5);
    const satParticleCount = satCount > 0
      ? Math.floor((count - mainParticleEnd) / satCount)
      : 0;

    // --- Main sphere particles: rays from main center ---
    for (let i = 0; i < mainParticleEnd; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      // Ray: mainCenter + n̂ * t
      let tLow = 0.05;
      let tHigh = mainR * 4;

      const fHigh = metaballField(
        mainCx + nx * tHigh, mainCy + ny * tHigh, mainCz + nz * tHigh,
        mainCx, mainCy, mainCz, mainR2,
        satCenters, satR2, satCount,
      );

      if (fHigh >= threshold) {
        positions[i * 3] = mainCx + nx * tHigh;
        positions[i * 3 + 1] = mainCy + ny * tHigh;
        positions[i * 3 + 2] = mainCz + nz * tHigh;
        continue;
      }

      for (let iter = 0; iter < 8; iter++) {
        const tMid = (tLow + tHigh) * 0.5;
        const f = metaballField(
          mainCx + nx * tMid, mainCy + ny * tMid, mainCz + nz * tMid,
          mainCx, mainCy, mainCz, mainR2,
          satCenters, satR2, satCount,
        );
        if (f > threshold) tLow = tMid;
        else tHigh = tMid;
      }

      const tF = (tLow + tHigh) * 0.5;
      positions[i * 3] = mainCx + nx * tF;
      positions[i * 3 + 1] = mainCy + ny * tF;
      positions[i * 3 + 2] = mainCz + nz * tF;
    }

    // --- Satellite particles: rays from each satellite center ---
    for (let s = 0; s < satCount; s++) {
      const scx = satCenters[s * 3];
      const scy = satCenters[s * 3 + 1];
      const scz = satCenters[s * 3 + 2];

      const start = mainParticleEnd + s * satParticleCount;
      const end = (s === satCount - 1) ? count : start + satParticleCount;

      for (let i = start; i < end; i++) {
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];

        // Ray: satCenter + n̂ * t
        let tLow = 0.05;
        let tHigh = satR * 4;

        const fHigh = metaballField(
          scx + nx * tHigh, scy + ny * tHigh, scz + nz * tHigh,
          mainCx, mainCy, mainCz, mainR2,
          satCenters, satR2, satCount,
        );

        if (fHigh >= threshold) {
          positions[i * 3] = scx + nx * tHigh;
          positions[i * 3 + 1] = scy + ny * tHigh;
          positions[i * 3 + 2] = scz + nz * tHigh;
          continue;
        }

        for (let iter = 0; iter < 8; iter++) {
          const tMid = (tLow + tHigh) * 0.5;
          const f = metaballField(
            scx + nx * tMid, scy + ny * tMid, scz + nz * tMid,
            mainCx, mainCy, mainCz, mainR2,
            satCenters, satR2, satCount,
          );
          if (f > threshold) tLow = tMid;
          else tHigh = tMid;
        }

        const tF = (tLow + tHigh) * 0.5;
        positions[i * 3] = scx + nx * tF;
        positions[i * 3 + 1] = scy + ny * tF;
        positions[i * 3 + 2] = scz + nz * tF;
      }
    }
  });

  activeLinearConfig = config;
  return config;
}
