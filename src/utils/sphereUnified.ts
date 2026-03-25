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
) {
  const satCount = Math.min(config.satelliteCount, 8);
  const mainR2 = config.mainRadius * config.mainRadius;
  const satR2 = config.satelliteRadius * config.satelliteRadius;
  const threshold = config.threshold;
  const mainCx = 0;
  const mainCy = config.bobAmplitude * Math.sin(elapsed * config.bobSpeed);
  const mainCz = 0;

  const satZLimit = maxSatZ ?? config.mainRadius;
  for (let s = 0; s < satCount; s++) {
    const d = allDirs[s];
    const t = Math.sin(elapsed * config.travelSpeed * d.speedMul + d.phase);
    const dist = config.travelDistance * t;
    satCenters[s * 3] = mainCx + d.dir[0] * dist;
    satCenters[s * 3 + 1] = mainCy + d.dir[1] * dist;
    satCenters[s * 3 + 2] = Math.min(mainCz + d.dir[2] * dist, satZLimit);
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

// ─── Unified config (exposed for DebugPanel) ───

export interface UnifiedSphereConfig {
  deform: SphereDeformConfig;
  orbital2: MetaballLinearConfig;  // 위성 직선 왕복 + 파티클 분할 (리퀴드 브릿지)
  transitionWidth: number; // fraction of local progress for blending (0~0.5)
  boundary: number; // deform → orbital2 경계 (0~1)
  // Per-sub-effect holdScatter
  deformHoldScatter: number;
  orbital2HoldScatter: number;
  // Per-sub-effect lighting override
  deformLighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  orbital2Lighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  // 서브섹션별 파티클 수 (미지정 시 초기 activeCount 유지)
  deformActiveCount?: number;
  orbital2ActiveCount?: number;
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
    orbital2: {
      mainRadius: 1.00,
      bobAmplitude: 0.75,
      bobSpeed: 1.1,
      satelliteCount: 5,
      satelliteRadius: 0.2,
      travelDistance: 2.0,
      travelSpeed: 0.8,
      threshold: 1.05,
    },
    transitionWidth: 0.1,
    boundary: 0.35,       // deform → orbital2 경계
    deformHoldScatter: 0,
    orbital2HoldScatter: 0.001,
    deformLighting:  { ambient: 0.1, diffuse: 2.0, specular: 2.0, shininess: 1.0 },
    orbital2Lighting: { ambient: 0.2, diffuse: 6.0, specular: 1.0, shininess: 1.0 },
    orbital2MainParticleRatio: 0.80,
    orbital2MaxSatZ: -1.0,
  };

  const positions = shape.positions;
  const initialActiveCount = shape.activeCount;
  const maxCount = Math.max(
    initialActiveCount,
    config.deformActiveCount ?? 0,
    config.orbital2ActiveCount ?? 0,
  );

  // Precompute shared state
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

  // Scratch buffers for blending
  const bufA = new Float32Array(maxCount * 3);
  const bufB = new Float32Array(maxCount * 3);
  // Per-particle center buffer for dynamic lighting (orbital2용)
  const centerBuf = new Float32Array(maxCount * 3);

  // Satellite data for linear reciprocation
  const allLinearDirs = makeLinearDirections(8);
  const satCenters2 = new Float64Array(8 * 3);

  let elapsed = 0;

  const sectionStart = bounds.start;
  const sectionEnd = bounds.end;
  const sectionLen = sectionEnd - sectionStart;

  morpher.setShapeUpdater(shapeIdx, (delta: number, scrollProgress: number) => {
    elapsed += delta;

    const localProgress = Math.max(0, Math.min(1,
      (scrollProgress - sectionStart) / sectionLen
    ));

    const tw = config.transitionWidth;
    const B = config.boundary; // deform → orbital2 boundary

    // 서브섹션별 동적 activeCount 결정
    const getSubCount = (effect: string): number => {
      if (effect === 'deform' && config.deformActiveCount) return config.deformActiveCount;
      if (effect === 'orbital2' && config.orbital2ActiveCount) return config.orbital2ActiveCount;
      return initialActiveCount;
    };

    // holdScatter
    if (localProgress < B - tw) {
      shape.holdScatter = config.deformHoldScatter;
    } else if (localProgress < B + tw) {
      const t = (localProgress - (B - tw)) / (2 * tw);
      shape.holdScatter = config.deformHoldScatter * (1 - t) + config.orbital2HoldScatter * t;
    } else {
      shape.holdScatter = config.orbital2HoldScatter;
    }

    // Per-particle center 전환
    if (localProgress < B - tw) {
      shape.usePerParticleCenter = 0;
    } else if (localProgress < B + tw) {
      const t = (localProgress - (B - tw)) / (2 * tw);
      shape.usePerParticleCenter = t * t * (3 - 2 * t); // smoothstep
    } else {
      shape.usePerParticleCenter = 1;
    }

    // Lighting
    {
      const dLt = config.deformLighting;
      const o2Lt = config.orbital2Lighting;

      if (dLt || o2Lt) {
        const lerpVal = (a: number, b: number, t: number) => a + (b - a) * t;

        let targetLt: { ambient: number; diffuse: number; specular: number; shininess: number };

        if (localProgress < B - tw) {
          targetLt = { ...dLt! } as typeof targetLt;
        } else if (localProgress < B + tw) {
          const t = (localProgress - (B - tw)) / (2 * tw);
          targetLt = {
            ambient: lerpVal(dLt!.ambient!, o2Lt!.ambient!, t),
            diffuse: lerpVal(dLt!.diffuse!, o2Lt!.diffuse!, t),
            specular: lerpVal(dLt!.specular!, o2Lt!.specular!, t),
            shininess: lerpVal(dLt!.shininess!, o2Lt!.shininess!, t),
          };
        } else {
          targetLt = { ...o2Lt! } as typeof targetLt;
        }

        shape.lighting = targetLt;
      }
    }

    // Determine active effect(s) and blend factor
    let effectA: 'deform' | 'orbital2';
    let effectB: 'deform' | 'orbital2' | null = null;
    let blendT = 0;

    if (localProgress < B - tw) {
      effectA = 'deform';
    } else if (localProgress < B + tw) {
      effectA = 'deform';
      effectB = 'orbital2';
      blendT = (localProgress - (B - tw)) / (2 * tw);
    } else {
      effectA = 'orbital2';
    }

    // Smoothstep the blend
    blendT = Math.max(0, Math.min(1, blendT));
    blendT = blendT * blendT * (3 - 2 * blendT);

    // 동적 activeCount
    let targetActiveCount = getSubCount(effectA);
    if (effectB) {
      const toCount = getSubCount(effectB);
      targetActiveCount = Math.round(targetActiveCount + (toCount - targetActiveCount) * blendT);
    }
    shape.activeCount = targetActiveCount;
    const count = targetActiveCount;

    // Compute effect A
    const outA = effectB ? bufA : positions;
    switch (effectA) {
      case 'deform':
        computeDeform(outA, count, normals, radii, elapsed, config.deform);
        break;
      case 'orbital2':
        computeMetaballLinearSplit(outA, count, normals, elapsed, config.orbital2, allLinearDirs, satCenters2, config.orbital2MainParticleRatio, config.orbital2MaxSatZ, centerBuf);
        break;
    }

    // Compute effect B and blend
    if (effectB) {
      computeMetaballLinearSplit(bufB, count, normals, elapsed, config.orbital2, allLinearDirs, satCenters2, config.orbital2MainParticleRatio, config.orbital2MaxSatZ, centerBuf);

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
