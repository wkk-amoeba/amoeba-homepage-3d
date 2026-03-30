/**
 * GLB -> Float32Array(.bin) vertex extraction prebuild script.
 *
 * Reads each GLB model, extracts world-space vertices, uniformly samples
 * them down to MAX_VERTICES, centers at origin, and writes a raw
 * Float32Array binary file.
 *
 * Usage: node scripts/extract-vertices.mjs
 */

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMaterialsPBRSpecularGlossiness } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------------------------------------
// Config  (keep in sync with src/config/sceneConfig.ts)
// -------------------------------------------------------------------
const MODELS = [
  { name: 'low_sphere', file: 'low_sphere.glb' },
  { name: 'low_cube', file: 'low_cube.glb' },
  { name: 'low_cone', file: 'low_cone.glb' },
  { name: 'high_shpere', file: 'high_shpere.glb' },
  { name: 'high_cube', file: 'high_cube.glb' },
  { name: 'high_cone', file: 'high_cone.glb' },
  { name: 'city_test', file: 'city_test.glb' },
  { name: 'city_shanghai', file: 'city-_shanghai-sandboxie.glb', maxVertices: 50_000 },
  { name: 'san_francisco_city', file: 'san_francisco_city.glb', maxVertices: 50_000, heightBias: { threshold: 0.3, weight: 5 } },
  { name: 'inception_gyro', file: 'inception_gyro.glb' },
  { name: 'Cone', file: 'Cone.glb' },
  { name: 'Cube', file: 'Cube.glb' },
  { name: 'model_2', file: '2.glb' },
  { name: 'circle_1', file: '0324_circle_1.glb' },
  { name: '0325_line-sphere_4', file: '0325_line-sphere_4.glb' },
];

const MAX_VERTICES = 15_000;

// -------------------------------------------------------------------
// Minimal 4x4 matrix helpers (column-major, like glTF / Three.js)
// -------------------------------------------------------------------

function mat4Identity() {
  // prettier-ignore
  return new Float64Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function mat4FromTRS(t, r, s) {
  // t = [tx,ty,tz], r = [qx,qy,qz,qw], s = [sx,sy,sz]
  const [qx, qy, qz, qw] = r;
  const [sx, sy, sz] = s;

  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  const out = new Float64Array(16);
  out[0]  = (1 - (yy + zz)) * sx;
  out[1]  = (xy + wz) * sx;
  out[2]  = (xz - wy) * sx;
  out[3]  = 0;
  out[4]  = (xy - wz) * sy;
  out[5]  = (1 - (xx + zz)) * sy;
  out[6]  = (yz + wx) * sy;
  out[7]  = 0;
  out[8]  = (xz + wy) * sz;
  out[9]  = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
  return out;
}

function mat4Multiply(a, b) {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[0 * 4 + i] * b[j * 4 + 0] +
        a[1 * 4 + i] * b[j * 4 + 1] +
        a[2 * 4 + i] * b[j * 4 + 2] +
        a[3 * 4 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8]  * z + m[12],
    m[1] * x + m[5] * y + m[9]  * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// -------------------------------------------------------------------
// Triangle extraction (world-space)
// -------------------------------------------------------------------

function extractTriangles(document) {
  const triangles = []; // array of { v0, v1, v2 } (each vec3)
  const root = document.getRoot();
  const defaultScene = root.getDefaultScene() || root.listScenes()[0];
  if (!defaultScene) return triangles;

  function traverse(nodes, parentWorld) {
    for (const node of nodes) {
      const t = node.getTranslation();
      const r = node.getRotation();
      const s = node.getScale();
      const local = mat4FromTRS(t, r, s);
      const world = mat4Multiply(parentWorld, local);

      const mesh = node.getMesh();
      if (mesh) {
        for (const prim of mesh.listPrimitives()) {
          const posAccessor = prim.getAttribute('POSITION');
          if (!posAccessor) continue;
          const pos = posAccessor.getArray();
          const indices = prim.getIndices();

          if (indices) {
            const idxArr = indices.getArray();
            for (let i = 0; i < idxArr.length; i += 3) {
              const i0 = idxArr[i], i1 = idxArr[i + 1], i2 = idxArr[i + 2];
              triangles.push({
                v0: transformPoint(world, pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]),
                v1: transformPoint(world, pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]),
                v2: transformPoint(world, pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]),
              });
            }
          } else {
            const count = posAccessor.getCount();
            for (let i = 0; i < count; i += 3) {
              triangles.push({
                v0: transformPoint(world, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]),
                v1: transformPoint(world, pos[(i + 1) * 3], pos[(i + 1) * 3 + 1], pos[(i + 1) * 3 + 2]),
                v2: transformPoint(world, pos[(i + 2) * 3], pos[(i + 2) * 3 + 1], pos[(i + 2) * 3 + 2]),
              });
            }
          }
        }
      }

      traverse(node.listChildren(), world);
    }
  }

  traverse(defaultScene.listChildren(), mat4Identity());
  return triangles;
}

// -------------------------------------------------------------------
// Surface sampling: uniformly sample points on triangle surfaces
// -------------------------------------------------------------------

function triangleArea(v0, v1, v2) {
  const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
  const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function sampleTriangleSurface(triangles, targetCount, heightBias = null) {
  // Compute Y bounding box for height bias normalization
  let minY = 0, maxY = 1;
  if (heightBias) {
    minY = Infinity; maxY = -Infinity;
    for (const t of triangles) {
      for (const v of [t.v0, t.v1, t.v2]) {
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
      }
    }
  }

  // Compute cumulative area distribution (with optional height bias)
  const areas = triangles.map(t => {
    let a = triangleArea(t.v0, t.v1, t.v2);
    if (heightBias && maxY > minY) {
      const centerY = (t.v0[1] + t.v1[1] + t.v2[1]) / 3;
      const normalizedY = (centerY - minY) / (maxY - minY);
      if (normalizedY >= heightBias.threshold) {
        a *= heightBias.weight;
      }
    }
    return a;
  });
  const totalArea = areas.reduce((s, a) => s + a, 0);
  const cdf = new Float64Array(areas.length);
  cdf[0] = areas[0];
  for (let i = 1; i < areas.length; i++) {
    cdf[i] = cdf[i - 1] + areas[i];
  }

  // Sample points proportional to triangle area
  const sampled = [];
  for (let n = 0; n < targetCount; n++) {
    // Pick triangle weighted by area
    const r = Math.random() * totalArea;
    let idx = 0;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    idx = lo;

    const { v0, v1, v2 } = triangles[idx];
    // Random point on triangle (barycentric)
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    sampled.push(
      w * v0[0] + u * v1[0] + v * v2[0],
      w * v0[1] + u * v1[1] + v * v2[1],
      w * v0[2] + u * v1[2] + v * v2[2],
    );
  }

  return sampled;
}

// -------------------------------------------------------------------
// Center at origin
// -------------------------------------------------------------------

function centerPoints(sampled) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < sampled.length; i += 3) {
    minX = Math.min(minX, sampled[i]);
    minY = Math.min(minY, sampled[i + 1]);
    minZ = Math.min(minZ, sampled[i + 2]);
    maxX = Math.max(maxX, sampled[i]);
    maxY = Math.max(maxY, sampled[i + 1]);
    maxZ = Math.max(maxZ, sampled[i + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  for (let i = 0; i < sampled.length; i += 3) {
    sampled[i]     -= cx;
    sampled[i + 1] -= cy;
    sampled[i + 2] -= cz;
  }

  return sampled;
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

async function main() {
  console.log('Extracting vertices from GLB models...\n');

  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, KHRMaterialsPBRSpecularGlossiness])
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const modelsDir = path.resolve('models-src');
  const outputDir = path.resolve('public/models/vertices');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const model of MODELS) {
    const targetCount = model.maxVertices || MAX_VERTICES;
    const binName = (model.binName || model.file).replace('.glb', '.bin');
    const outPath = path.join(outputDir, binName);

    const glbPath = path.join(modelsDir, model.file);

    if (!fs.existsSync(glbPath)) {
      console.warn(`  SKIP: ${model.file} not found`);
      continue;
    }

    const document = await io.read(glbPath);
    const triangles = extractTriangles(document);

    if (triangles.length === 0) {
      console.warn(`  SKIP: ${model.name} has no triangles`);
      continue;
    }

    // Filter out low triangles if heightCutoff is set
    let filteredTriangles = triangles;
    if (model.heightCutoff != null && model.heightCutoff > 0) {
      let minY = Infinity, maxY = -Infinity;
      for (const t of triangles) {
        for (const v of [t.v0, t.v1, t.v2]) {
          if (v[1] < minY) minY = v[1];
          if (v[1] > maxY) maxY = v[1];
        }
      }
      const cutY = minY + (maxY - minY) * model.heightCutoff;
      filteredTriangles = triangles.filter(t => {
        const centerY = (t.v0[1] + t.v1[1] + t.v2[1]) / 3;
        return centerY >= cutY;
      });
      console.log(`    heightCutoff ${model.heightCutoff}: ${triangles.length} → ${filteredTriangles.length} triangles`);
    }

    const sampled = sampleTriangleSurface(filteredTriangles, targetCount, model.heightBias || null);
    centerPoints(sampled);
    const float32 = new Float32Array(sampled);
    const sampledCount = sampled.length / 3;

    fs.writeFileSync(outPath, Buffer.from(float32.buffer));

    console.log(
      `  ${model.name}: ${sampledCount} points ` +
      `(from ${triangles.length} triangles), ${float32.byteLength} bytes → ${binName}`
    );
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
