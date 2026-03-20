/**
 * Unified Sphere effect: a single shape that transitions between three effects
 * based on scroll position, using per-particle position lerp during transitions.
 *
 * Sub-section layout (within the Sphere's sectionSpan=3 scroll range):
 *   [0.0, subSection1]  → Deform (breathing/crumple)
 *   [subSection1, subSection2] → Metaball Orbital
 *   [subSection2, 1.0]  → Metaball Linear Split (위성 직선 왕복 + 리퀴드 브릿지)
 *
 * During boundaries (±transitionWidth), two effects run simultaneously
 * and their output positions are lerped per-particle.
 */

import type { SphereDeformConfig } from './sphereDeform';
import type { MetaballConfig, MetaballLinearConfig } from './sphereMetaball';

// ─── Noise functions (copied from sphereDeform.ts) ───

function hash3(x: number, y: number, z: number): number {
  let h = x * 127.1 + y * 311.7 + z * 74.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

function smoothNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const nx00 = n000 + (n100 - n000) * sx;
  const nx10 = n010 + (n110 - n010) * sx;
  const nx01 = n001 + (n101 - n001) * sx;
  const nx11 = n011 + (n111 - n011) * sx;
  const nxy0 = nx00 + (nx10 - nx00) * sy;
  const nxy1 = nx01 + (nx11 - nx01) * sy;
  return nxy0 + (nxy1 - nxy0) * sz;
}

function fbm(x: number, y: number, z: number): number {
  let val = smoothNoise3(x, y, z) * 0.7;
  val += smoothNoise3(x * 2.1, y * 2.1, z * 2.1) * 0.3;
  return val;
}

// ─── Metaball field (copied from sphereMetaball.ts) ───

function metaballField(
  px: number, py: number, pz: number,
  mainCx: number, mainCy: number, mainCz: number, mainR2: number,
  satCenters: Float64Array, satR2: number, satCount: number,
): number {
  const dx0 = px - mainCx, dy0 = py - mainCy, dz0 = pz - mainCz;
  let field = mainR2 / (dx0 * dx0 + dy0 * dy0 + dz0 * dz0 + 0.0001);
  for (let s = 0; s < satCount; s++) {
    const dx = px - satCenters[s * 3];
    const dy = py - satCenters[s * 3 + 1];
    const dz = pz - satCenters[s * 3 + 2];
    field += satR2 / (dx * dx + dy * dy + dz * dz + 0.0001);
  }
  return field;
}

// ─── Satellite orbit definitions (from sphereMetaball.ts) ───

interface Satellite {
  ax1: [number, number, number];
  ax2: [number, number, number];
  phaseOffset: number;
  speedMul: number;
}

function makeSatellites(count: number): Satellite[] {
  const satellites: Satellite[] = [];
  for (let i = 0; i < count; i++) {
    const phi = (i / count) * Math.PI;
    const theta = (i / count) * Math.PI * 2 * 0.618;
    const ax1: [number, number, number] = [
      Math.cos(theta), Math.sin(phi) * 0.3, Math.sin(theta),
    ];
    const ax2: [number, number, number] = [
      -Math.sin(theta) * Math.cos(phi), Math.cos(phi), Math.cos(theta) * Math.cos(phi),
    ];
    const len1 = Math.sqrt(ax1[0] ** 2 + ax1[1] ** 2 + ax1[2] ** 2);
    const len2 = Math.sqrt(ax2[0] ** 2 + ax2[1] ** 2 + ax2[2] ** 2);
    ax1[0] /= len1; ax1[1] /= len1; ax1[2] /= len1;
    ax2[0] /= len2; ax2[1] /= len2; ax2[2] /= len2;
    satellites.push({
      ax1, ax2,
      phaseOffset: (i / count) * Math.PI * 2,
      speedMul: 0.7 + (i % 3) * 0.3,
    });
  }
  return satellites;
}

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

function computeMetaballOrbital(
  output: Float32Array, count: number,
  normals: Float32Array, avgRadius: number,
  elapsed: number, config: MetaballConfig,
  allSatellites: Satellite[], satCenters: Float64Array,
) {
  const satCount = Math.min(config.satelliteCount, 8);
  const mainR2 = config.mainRadius * config.mainRadius;
  const satR2 = config.satelliteRadius * config.satelliteRadius;
  const mainCx = 0;
  const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
  const mainCz = 0;

  for (let s = 0; s < satCount; s++) {
    const sat = allSatellites[s];
    const angle = elapsed * config.orbitSpeed * sat.speedMul + sat.phaseOffset;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const orbR = config.orbitRadius + config.mainRadius;
    satCenters[s * 3] = mainCx + (sat.ax1[0] * cosA + sat.ax2[0] * sinA) * orbR;
    satCenters[s * 3 + 1] = mainCy + (sat.ax1[1] * cosA + sat.ax2[1] * sinA) * orbR;
    satCenters[s * 3 + 2] = mainCz + (sat.ax1[2] * cosA + sat.ax2[2] * sinA) * orbR;
  }

  const threshold = config.threshold;
  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let tLow = 0.05, tHigh = avgRadius * 3;
    const fHigh = metaballField(nx * tHigh, ny * tHigh, nz * tHigh, mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount);
    if (fHigh >= threshold) {
      output[i * 3] = nx * tHigh; output[i * 3 + 1] = ny * tHigh; output[i * 3 + 2] = nz * tHigh;
      continue;
    }
    for (let iter = 0; iter < 8; iter++) {
      const tMid = (tLow + tHigh) * 0.5;
      const f = metaballField(nx * tMid, ny * tMid, nz * tMid, mainCx, mainCy, mainCz, mainR2, satCenters, satR2, satCount);
      if (f > threshold) tLow = tMid; else tHigh = tMid;
    }
    const t = (tLow + tHigh) * 0.5;
    output[i * 3] = nx * t; output[i * 3 + 1] = ny * t; output[i * 3 + 2] = nz * t;
  }
}

// Linear travel directions (fixed 3D spread for satellite reciprocation)
interface LinearDir {
  dir: [number, number, number];
  phase: number;
  speedMul: number;
}

function makeLinearDirections(count: number): LinearDir[] {
  const baseDirections: [number, number, number][] = [
    [-0.7, 0.7, 0.1], [0.0, 1.0, 0.0], [0.8, 0.5, -0.2], [0.9, -0.1, 0.3],
    [-0.8, -0.3, 0.2], [-0.3, -0.8, -0.4], [0.5, -0.7, 0.5], [0.1, 0.3, -0.9],
  ];
  const dirs: LinearDir[] = [];
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
 * Split-particle linear: 50% particles ray-march from main center,
 * remaining 50% split among satellites (each ray-marches from its own center).
 * Satellites reciprocate along fixed directions — when they approach the main
 * sphere, metaball liquid bridges form; when far, they maintain their own shape.
 * This is the original main-branch Sphere3 behavior.
 */
function computeMetaballLinearSplit(
  output: Float32Array, count: number,
  normals: Float32Array,
  elapsed: number, config: MetaballLinearConfig,
  allDirs: LinearDir[], satCenters: Float64Array,
  mainParticleRatio?: number,
  maxSatZ?: number,
  centerOutput?: Float32Array,
) {
  const satCount = Math.min(config.satelliteCount, 8);
  const mainR2 = config.mainRadius * config.mainRadius;
  const satR2 = config.satelliteRadius * config.satelliteRadius;
  const threshold = config.threshold;
  const mainCx = 0;
  const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
  const mainCz = 0;

  // Update satellite positions (linear reciprocation along fixed directions)
  // 위성 Z를 메인 구 앞면 이내로 제한 (카메라 앞으로 튀어나오지 않게)
  const satZLimit = maxSatZ ?? config.mainRadius;
  for (let s = 0; s < satCount; s++) {
    const d = allDirs[s];
    const t = Math.sin(elapsed * config.travelSpeed * d.speedMul + d.phase);
    const dist = config.travelDistance * t;
    satCenters[s * 3] = mainCx + d.dir[0] * dist;
    satCenters[s * 3 + 1] = mainCy + d.dir[1] * dist;
    satCenters[s * 3 + 2] = Math.min(mainCz + d.dir[2] * dist, satZLimit);
  }

  // 메인/위성 파티클 비율: mainParticleRatio 지정 시 사용, 미지정 시 표면적 비례 자동 계산
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
  // Interleaved: particle i → satellite (i % satCount), ensuring each satellite gets
  // normals spread across the full index range (avoids spatial clustering from GLB vertex order)
  const satFallbackR = config.satelliteRadius / Math.sqrt(threshold);
  const scanRange = config.satelliteRadius * 4;
  const scanSteps = 12;
  const scanDt = scanRange / scanSteps;

  for (let i = mainParticleEnd; i < count; i++) {
    const s = (i - mainParticleEnd) % satCount;
    const scx = satCenters[s * 3];
    const scy = satCenters[s * 3 + 1];
    const scz = satCenters[s * 3 + 2];

    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];

    // Linear scan from satellite center outward to find FIRST surface crossing.
    // This prevents the bisection from converging to the main sphere's surface
    // when the metaball field is non-monotonic (satellite near main).
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
      // Entire scan range above threshold — satellite deep inside merged blob.
      // Place on satellite's theoretical isolated surface.
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

    // Refine first crossing with bisection
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

// ─── Unified config (exposed for DebugPanel) ───

export interface UnifiedSphereConfig {
  deform: SphereDeformConfig;
  metaball: MetaballConfig;
  orbital2: MetaballLinearConfig;  // 위성 직선 왕복 + 파티클 분할 (리퀴드 브릿지)
  transitionWidth: number; // fraction of local progress for blending (0~0.5)
  subSection1: number; // deform → orbital 경계 (0~1, 기본 0.2)
  subSection2: number; // orbital → orbital2 경계 (0~1, 기본 0.4)
  // [0, subSection1] = deform, [subSection1, subSection2] = orbital, [subSection2, 1.0] = orbital2(hold)
  // Per-sub-effect holdScatter
  deformHoldScatter: number;
  orbitalHoldScatter: number;
  orbital2HoldScatter: number;
  // Per-sub-effect lighting override
  deformLighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  orbitalLighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  orbital2Lighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  // 서브섹션별 파티클 수 (미지정 시 초기 activeCount 유지)
  deformActiveCount?: number;
  orbitalActiveCount: 1000;
  orbital2ActiveCount: 10000; // 위선 liner orbital2ActiveCount?: number;
  // orbital2 메인/위성 파티클 비율 (0~1). 미지정 시 표면적 비례 자동 계산
  orbital2MainParticleRatio?: number;
  // 위성 최대 Z좌표 (카메라 방향 제한). 0=메인 중심까지, 음수=더 뒤로
  orbital2MaxSatZ?: number;
}

let activeUnifiedConfig: UnifiedSphereConfig | null = null;
export function getActiveUnifiedConfig(): UnifiedSphereConfig | null {
  return activeUnifiedConfig;
}

// ─── Registration ───

export function registerUnifiedSphere(
  morpher: {
    getShapeTargets: () => { positions: Float32Array; activeCount: number; holdScatter: number; lighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number }; particleCenters?: Float32Array; usePerParticleCenter?: number }[];
    setShapeUpdater: (idx: number, fn: (delta: number, scrollProgress: number) => void) => void;
    getSectionBounds: (idx: number) => { start: number; end: number } | null;
  },
  shapeIdx: number,
): UnifiedSphereConfig | null {
  const shapeTargets = morpher.getShapeTargets();
  const shape = shapeTargets[shapeIdx];
  if (!shape) {
    console.warn(`registerUnifiedSphere: shape index ${shapeIdx} not found`);
    return null;
  }

  const bounds = morpher.getSectionBounds(shapeIdx);
  if (!bounds) {
    console.warn(`registerUnifiedSphere: no section bounds for shape ${shapeIdx}`);
    return null;
  }

  const config: UnifiedSphereConfig = {
    deform: {
      noiseScale: 3.4,
      maxDeform: 0,
      breathSpeed: 1.8,
      breathMin: 0.7,
      breathMax: 1.0,
      noiseSpeed: 0.25,
    },
    metaball: {
      mainRadius: 0.5,
      bobAmplitude: 0,
      bobSpeed: 1.2,
      satelliteCount: 1,
      satelliteRadius: 0.1,
      orbitRadius: 0.1,
      orbitSpeed: 0.6,
      threshold: 0.5,
    },
    orbital2: {
      mainRadius: 1.00, //0.83 0.7
      bobAmplitude: 0.75,
      bobSpeed: 1.1,
      satelliteCount: 5,
      satelliteRadius: 0.2,  //
      travelDistance: 2.0, //1.9 1.5
      travelSpeed: 0.8,
      threshold: 1.05,
    },
    transitionWidth: 0.1, // 10% of local progress for blending
    subSection1: 0.2,     // deform ends at 20% → orbital starts
    subSection2: 0.4,     // orbital ends at 40% → orbital2(위성) holds 60%
    deformHoldScatter: 0,
    orbitalHoldScatter: 0.015,
    orbital2HoldScatter: 0.001,
    // 서브 섹션별 조명 (4속성 모두 명시하여 프레임 간 값 잔존 방지)
    deformLighting:  { ambient: 0.1, diffuse: 3.0, specular: 10.0, shininess: 20.0 },
    orbitalLighting: { ambient: 0.15, diffuse: 0.4, specular: 0, shininess: 2.0 },
    orbital2Lighting: { ambient: 0.2, diffuse: 6.0, specular: 10.0, shininess: 20.0 }, //0.12, 0.5, 0.3, 4.0  per-particle center로 위성별 개별 조명 적용
    orbital2MainParticleRatio: 0.80, // 메인/위성 파티클 비율 (0~1). 미지정 시 표면적 비례 자동 계산
    orbital2MaxSatZ: -1.0, // 위성 최대 Z (0=메인 중심까지, 음수=더 뒤로, 미지정=mainRadius)
  };

  const positions = shape.positions;
  // activeCount 기반으로 계산 (풀 전체가 아닌 유효 파티클만)
  const initialActiveCount = shape.activeCount;
  // 동적 activeCount를 위해 최대 가능 크기로 버퍼 할당
  const maxCount = Math.max(
    initialActiveCount,
    config.deformActiveCount ?? 0,
    config.orbitalActiveCount ?? 0,
    config.orbital2ActiveCount ?? 0,
  );

  // Precompute shared state (maxCount 크기로 할당)
  const normals = new Float32Array(maxCount * 3);
  const radii = new Float32Array(maxCount);
  for (let i = 0; i < initialActiveCount; i++) {
    const ox = positions[i * 3], oy = positions[i * 3 + 1], oz = positions[i * 3 + 2];
    const r = Math.sqrt(ox * ox + oy * oy + oz * oz);
    radii[i] = r;
    if (r > 0.001) {
      normals[i * 3] = ox / r;
      normals[i * 3 + 1] = oy / r;
      normals[i * 3 + 2] = oz / r;
    }
  }

  let avgRadius = 0;
  for (let i = 0; i < initialActiveCount; i++) avgRadius += radii[i];
  avgRadius /= initialActiveCount;

  // Scratch buffers for blending
  const bufA = new Float32Array(maxCount * 3);
  const bufB = new Float32Array(maxCount * 3);
  // Per-particle center buffer for dynamic lighting (orbital2용)
  const centerBuf = new Float32Array(maxCount * 3);

  // Satellite data: orbital uses circular orbits, orbital2 uses linear reciprocation
  const allSatellites = makeSatellites(8);
  const allLinearDirs = makeLinearDirections(8);
  const satCenters = new Float64Array(8 * 3);
  const satCenters2 = new Float64Array(8 * 3);

  let elapsed = 0;

  const sectionStart = bounds.start;
  const sectionEnd = bounds.end;
  const sectionLen = sectionEnd - sectionStart;

  morpher.setShapeUpdater(shapeIdx, (delta: number, scrollProgress: number) => {
    elapsed += delta;

    // Local progress within the Sphere's scroll range [0, 1]
    const localProgress = Math.max(0, Math.min(1,
      (scrollProgress - sectionStart) / sectionLen
    ));

    const tw = config.transitionWidth;
    const S1 = config.subSection1; // deform → orbital boundary
    const S2 = config.subSection2; // orbital → orbital2 boundary

    // 서브섹션별 동적 activeCount 결정
    let targetActiveCount = initialActiveCount;
    const getSubCount = (effect: string): number => {
      if (effect === 'deform' && config.deformActiveCount) return config.deformActiveCount;
      if (effect === 'orbital' && config.orbitalActiveCount) return config.orbitalActiveCount;
      if (effect === 'orbital2' && config.orbital2ActiveCount) return config.orbital2ActiveCount;
      return initialActiveCount;
    };

    // Dynamically set holdScatter based on active sub-section (lerp during transitions)
    if (localProgress < S1 - tw) {
      shape.holdScatter = config.deformHoldScatter;
    } else if (localProgress < S1 + tw) {
      const t = (localProgress - (S1 - tw)) / (2 * tw);
      shape.holdScatter = config.deformHoldScatter * (1 - t) + config.orbitalHoldScatter * t;
    } else if (localProgress < S2 - tw) {
      shape.holdScatter = config.orbitalHoldScatter;
    } else if (localProgress < S2 + tw) {
      const t = (localProgress - (S2 - tw)) / (2 * tw);
      shape.holdScatter = config.orbitalHoldScatter * (1 - t) + config.orbital2HoldScatter * t;
    } else {
      shape.holdScatter = config.orbital2HoldScatter;
    }

    // Per-particle center 전환: orbital→orbital2 구간에서 0→1 smoothstep
    if (localProgress < S2 - tw) {
      shape.usePerParticleCenter = 0;
    } else if (localProgress < S2 + tw) {
      const t = (localProgress - (S2 - tw)) / (2 * tw);
      shape.usePerParticleCenter = t * t * (3 - 2 * t); // smoothstep
    } else {
      shape.usePerParticleCenter = 1;
    }

    // Dynamically set lighting based on active sub-section
    // 매 프레임 새 객체로 설정하여 이전 프레임 값 잔존 방지
    {
      const dLt = config.deformLighting;
      const oLt = config.orbitalLighting;
      const o2Lt = config.orbital2Lighting;

      if (dLt || oLt || o2Lt) {
        const lerpVal = (a: number, b: number, t: number) => a + (b - a) * t;

        let targetLt: { ambient: number; diffuse: number; specular: number; shininess: number };

        if (localProgress < S1 - tw) {
          targetLt = { ...dLt! } as typeof targetLt;
        } else if (localProgress < S1 + tw) {
          const t = (localProgress - (S1 - tw)) / (2 * tw);
          targetLt = {
            ambient: lerpVal(dLt!.ambient!, oLt!.ambient!, t),
            diffuse: lerpVal(dLt!.diffuse!, oLt!.diffuse!, t),
            specular: lerpVal(dLt!.specular!, oLt!.specular!, t),
            shininess: lerpVal(dLt!.shininess!, oLt!.shininess!, t),
          };
        } else if (localProgress < S2 - tw) {
          targetLt = { ...oLt! } as typeof targetLt;
        } else if (localProgress < S2 + tw) {
          const t = (localProgress - (S2 - tw)) / (2 * tw);
          targetLt = {
            ambient: lerpVal(oLt!.ambient!, o2Lt!.ambient!, t),
            diffuse: lerpVal(oLt!.diffuse!, o2Lt!.diffuse!, t),
            specular: lerpVal(oLt!.specular!, o2Lt!.specular!, t),
            shininess: lerpVal(oLt!.shininess!, o2Lt!.shininess!, t),
          };
        } else {
          targetLt = { ...o2Lt! } as typeof targetLt;
        }

        shape.lighting = targetLt;
      }
    }

    // Determine active effect(s) and blend factor
    let effectA: 'deform' | 'orbital' | 'orbital2';
    let effectB: 'deform' | 'orbital' | 'orbital2' | null = null;
    let blendT = 0; // 0 = pure A, 1 = pure B

    if (localProgress < S1 - tw) {
      // Pure deform
      effectA = 'deform';
    } else if (localProgress < S1 + tw) {
      // Transition: deform → orbital
      effectA = 'deform';
      effectB = 'orbital';
      blendT = (localProgress - (S1 - tw)) / (2 * tw);
    } else if (localProgress < S2 - tw) {
      // Pure orbital
      effectA = 'orbital';
    } else if (localProgress < S2 + tw) {
      // Transition: orbital → orbital2
      effectA = 'orbital';
      effectB = 'orbital2';
      blendT = (localProgress - (S2 - tw)) / (2 * tw);
    } else {
      // Pure orbital2 (위성 궤도 공전, holds for remaining 60%)
      effectA = 'orbital2';
    }

    // Smoothstep the blend
    blendT = Math.max(0, Math.min(1, blendT));
    blendT = blendT * blendT * (3 - 2 * blendT);

    // 서브섹션별 동적 activeCount 적용
    targetActiveCount = getSubCount(effectA);
    if (effectB) {
      const toCount = getSubCount(effectB);
      targetActiveCount = Math.round(targetActiveCount + (toCount - targetActiveCount) * blendT);
    }
    shape.activeCount = targetActiveCount;
    const count = targetActiveCount;

    // Compute effect A
    const outA = effectB ? bufA : positions; // write directly if no blend needed
    switch (effectA) {
      case 'deform':
        computeDeform(outA, count, normals, radii, elapsed, config.deform);
        break;
      case 'orbital':
        computeMetaballOrbital(outA, count, normals, avgRadius, elapsed, config.metaball, allSatellites, satCenters);
        break;
      case 'orbital2':
        computeMetaballLinearSplit(outA, count, normals, elapsed, config.orbital2, allLinearDirs, satCenters2, config.orbital2MainParticleRatio, config.orbital2MaxSatZ, centerBuf);
        break;
    }

    // Compute effect B and blend
    if (effectB) {
      switch (effectB) {
        case 'orbital':
          computeMetaballOrbital(bufB, count, normals, avgRadius, elapsed, config.metaball, allSatellites, satCenters);
          break;
        case 'orbital2':
          computeMetaballLinearSplit(bufB, count, normals, elapsed, config.orbital2, allLinearDirs, satCenters2, config.orbital2MainParticleRatio, config.orbital2MaxSatZ, centerBuf);
          break;
      }

      // Per-particle lerp: positions = bufA * (1-t) + bufB * t
      const invT = 1 - blendT;
      for (let i = 0; i < count * 3; i++) {
        positions[i] = bufA[i] * invT + bufB[i] * blendT;
      }
    }

    // Per-particle center를 shape에 전달 (orbital2 활성 시)
    if (effectA === 'orbital2' || effectB === 'orbital2') {
      shape.particleCenters = centerBuf;
    }
  });

  activeUnifiedConfig = config;
  return config;
}
