/**
 * Sphere deformation effect: particles oscillate between perfect sphere
 * and a crumpled/faceted surface, creating an organic breathing effect.
 *
 * Uses simplex-like hash noise on the radial direction of each particle
 * to create faceted bumps. The deformation intensity breathes over time.
 */

// Simple 3D hash for pseudo-random noise (no dependency needed)
function hash3(x: number, y: number, z: number): number {
  let h = x * 127.1 + y * 311.7 + z * 74.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

// Smooth noise by interpolating hashed grid values
function smoothNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  // smoothstep
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

// Fractal noise (2 octaves for nice faceted look)
function fbm(x: number, y: number, z: number): number {
  let val = smoothNoise3(x, y, z) * 0.7;
  val += smoothNoise3(x * 2.1, y * 2.1, z * 2.1) * 0.3;
  return val;
}

/** Module-level active config (set by registerSphereDeform, read by DebugPanel) */
let activeConfig: SphereDeformConfig | null = null;
export function getActiveSphereDeformConfig(): SphereDeformConfig | null {
  return activeConfig;
}

/** Runtime-adjustable deformation parameters */
export interface SphereDeformConfig {
  noiseScale: number;      // noise 공간 스케일 (낮을수록 큰 덩어리)
  maxDeform: number;       // 최대 변형 깊이 (정규화 유닛)
  breathSpeed: number;     // breathing 주기 속도 (rad/s)
  breathMin: number;       // 최소 변형 강도 (0=완전 구)
  breathMax: number;       // 최대 변형 강도
  noiseSpeed: number;      // noise 변화 속도
}

/**
 * Register a sphere deformation updater on a ParticleMorpher shape.
 * Returns the config object for runtime adjustment (e.g., debug panel).
 */
export function registerSphereDeform(
  morpher: {
    getShapeTargets: () => { positions: Float32Array }[];
    setShapeUpdater: (idx: number, fn: (delta: number) => void) => void;
  },
  shapeIdx: number,
  options: Partial<SphereDeformConfig> = {},
): SphereDeformConfig | null {
  const shapeTargets = morpher.getShapeTargets();
  const shape = shapeTargets[shapeIdx];
  if (!shape) {
    console.warn(`registerSphereDeform: shape index ${shapeIdx} not found`);
    return null;
  }

  const config: SphereDeformConfig = {
    noiseScale: options.noiseScale ?? 3.4,
    maxDeform: options.maxDeform ?? 0.42,
    breathSpeed: options.breathSpeed ?? 1.8,
    breathMin: options.breathMin ?? 0.7,
    breathMax: options.breathMax ?? 1.0,
    noiseSpeed: options.noiseSpeed ?? 0.25,
  };

  const positions = shape.positions;
  const count = positions.length / 3;

  // Store original positions (perfect sphere)
  const originalPositions = new Float32Array(positions);

  // Precompute per-particle radial direction and radius
  const radii = new Float32Array(count);
  const normals = new Float32Array(count * 3); // unit radial direction

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

  let elapsed = 0;

  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    elapsed += delta;

    // Breathing: smooth oscillation between min and max deformation
    // Use a combination of sin waves for organic feel
    const breath1 = Math.sin(elapsed * config.breathSpeed);
    const breath2 = Math.sin(elapsed * config.breathSpeed * 0.7 + 1.3);
    const breathRaw = (breath1 * 0.7 + breath2 * 0.3) * 0.5 + 0.5; // 0 to 1
    const intensity = config.breathMin + (config.breathMax - config.breathMin) * breathRaw;

    // Time offset for noise animation (slow drift)
    const timeOffset = elapsed * config.noiseSpeed;

    for (let i = 0; i < count; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const r = radii[i];

      // Sample noise at the particle's angular position (on unit sphere), drifting over time
      const noiseVal = fbm(
        nx * config.noiseScale + timeOffset,
        ny * config.noiseScale + timeOffset * 0.7,
        nz * config.noiseScale + timeOffset * 0.3,
      );

      // Displacement: inward dent (negative = crumple inward)
      const displacement = -noiseVal * config.maxDeform * intensity;
      const newR = r + displacement;

      positions[i * 3] = nx * newR;
      positions[i * 3 + 1] = ny * newR;
      positions[i * 3 + 2] = nz * newR;
    }
  });

  activeConfig = config;
  return config;
}
