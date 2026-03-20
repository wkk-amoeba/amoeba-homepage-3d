/**
 * Shared math functions for sphere effects (deform, metaball, orbital).
 * Extracted from sphereDeform.ts and sphereMetaball.ts to avoid duplication.
 */

// ─── Noise functions ───

export function hash3(x: number, y: number, z: number): number {
  let h = x * 127.1 + y * 311.7 + z * 74.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

export function smoothNoise3(x: number, y: number, z: number): number {
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

// Fractal noise (2 octaves for nice faceted look)
export function fbm(x: number, y: number, z: number): number {
  let val = smoothNoise3(x, y, z) * 0.7;
  val += smoothNoise3(x * 2.1, y * 2.1, z * 2.1) * 0.3;
  return val;
}

// ─── Metaball field ───

/** Evaluate metaball field at point (px, py, pz) */
export function metaballField(
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

// ─── Satellite orbit definitions ───

export interface Satellite {
  ax1: [number, number, number];
  ax2: [number, number, number];
  phaseOffset: number;
  speedMul: number;
}

export function makeSatellites(count: number): Satellite[] {
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

// ─── Linear travel directions (fixed 3D spread for satellite reciprocation) ───

export interface LinearDir {
  dir: [number, number, number];
  phase: number;
  speedMul: number;
}

export function makeLinearDirections(count: number): LinearDir[] {
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
