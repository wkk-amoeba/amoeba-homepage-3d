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
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------------------------------------
// Config  (keep in sync with src/config/sceneConfig.ts)
// -------------------------------------------------------------------
const MODELS = [
  { name: 'axis_fighter_plane', file: 'axis_fighter_plane.glb' },
  { name: 'HenchmanTough', file: 'HenchmanTough.glb' },
  { name: 'syringe_gun_-_game_ready_asset', file: 'syringe_gun_-_game_ready_asset.glb' },
  { name: 'porsche_911_carrera_4s', file: 'porsche_911_carrera_4s.glb' },
  { name: 'bmw_m2_performance_parts', file: 'bmw_m2_performance_parts.glb' },
  { name: 'GAZ69_FAB', file: 'GAZ69_FAB.glb' },
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
// Vertex extraction
// -------------------------------------------------------------------

function extractVertices(document) {
  const allVertices = [];
  const root = document.getRoot();
  const defaultScene = root.getDefaultScene() || root.listScenes()[0];
  if (!defaultScene) return allVertices;

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
          const arr = posAccessor.getArray();
          const count = posAccessor.getCount();
          for (let i = 0; i < count; i++) {
            const x = arr[i * 3];
            const y = arr[i * 3 + 1];
            const z = arr[i * 3 + 2];
            const [wx, wy, wz] = transformPoint(world, x, y, z);
            allVertices.push(wx, wy, wz);
          }
        }
      }

      traverse(node.listChildren(), world);
    }
  }

  traverse(defaultScene.listChildren(), mat4Identity());
  return allVertices;
}

// -------------------------------------------------------------------
// Sample, center, write
// -------------------------------------------------------------------

function sampleAndCenter(allVertices) {
  const totalCount = allVertices.length / 3;
  const targetCount = Math.min(MAX_VERTICES, totalCount);
  const step = Math.max(1, Math.ceil(totalCount / targetCount));

  const sampled = [];
  for (let i = 0; i < totalCount; i++) {
    if (i % step === 0) {
      sampled.push(allVertices[i * 3], allVertices[i * 3 + 1], allVertices[i * 3 + 2]);
    }
  }

  // Center at origin
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

  return { sampled, totalCount, sampledCount: sampled.length / 3 };
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

async function main() {
  console.log('Extracting vertices from GLB models...\n');

  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const modelsDir = path.resolve('public/models');
  const outputDir = path.resolve('public/models/vertices');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const model of MODELS) {
    const glbPath = path.join(modelsDir, model.file);

    if (!fs.existsSync(glbPath)) {
      console.warn(`  SKIP: ${model.file} not found`);
      continue;
    }

    const document = await io.read(glbPath);
    const allVertices = extractVertices(document);

    if (allVertices.length === 0) {
      console.warn(`  SKIP: ${model.name} has no vertices`);
      continue;
    }

    const { sampled, totalCount, sampledCount } = sampleAndCenter(allVertices);
    const float32 = new Float32Array(sampled);
    const binName = model.file.replace('.glb', '.bin');
    const outPath = path.join(outputDir, binName);

    fs.writeFileSync(outPath, Buffer.from(float32.buffer));

    console.log(
      `  ${model.name}: ${sampledCount} vertices ` +
      `(sampled from ${totalCount}), ${float32.byteLength} bytes → ${binName}`
    );
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
