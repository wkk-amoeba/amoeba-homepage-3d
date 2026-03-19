import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PERFORMANCE_CONFIG, getParticleMultiplier } from '../config/sceneConfig';

export interface FBXWalkingData {
  fbx: THREE.Group;
  mixer: THREE.AnimationMixer;
  mesh: THREE.SkinnedMesh;
  sampleIndices: number[];
  normalizeScale: number;
  initialPositions: Float32Array;
}

/**
 * Load Walking.glb, setup AnimationMixer, compute normalization,
 * and return everything needed for per-frame vertex extraction.
 */
export async function loadFBXWalking(): Promise<FBXWalkingData> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  const gltf = await loader.loadAsync('/models/Walking.glb');
  const fbx = gltf.scene;

  // Find SkinnedMesh
  let skinnedMesh: THREE.SkinnedMesh | null = null;
  fbx.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMesh = child as THREE.SkinnedMesh;
    }
  });

  if (!skinnedMesh) throw new Error('No SkinnedMesh in FBX');
  const mesh = skinnedMesh as THREE.SkinnedMesh;

  // Setup animation
  const mixer = new THREE.AnimationMixer(fbx);
  const animations = gltf.animations;
  if (animations.length > 0) {
    const clip = animations[0];

    // Strip root motion (zero X/Z on Hips position track)
    // GLB uses '.translation', FBX uses '.position'
    clip.tracks = clip.tracks.filter((track) => {
      if (track.name.endsWith('.position') || track.name.endsWith('.translation')) {
        const boneName = track.name.split('.')[0];
        if (boneName.includes('Hips') || boneName.includes('hips')) {
          const values = track.values;
          for (let i = 0; i < values.length; i += 3) {
            values[i] = 0;       // X (lateral)
            values[i + 1] = 0;   // Y (forward in GLB after Blender axis conversion)
            // values[i+2] kept  // Z (vertical)
          }
        }
      }
      return true;
    });

    const action = mixer.clipAction(clip);
    action.play();
  }

  // Add to a scene for bone matrix updates
  const tmpScene = new THREE.Scene();
  tmpScene.add(fbx);

  // Advance to initial pose
  mixer.update(0.4);
  fbx.updateMatrixWorld(true);
  if (mesh.skeleton) mesh.skeleton.update();

  // Compute sample indices (sub-sample to particleCount)
  const posAttr = mesh.geometry.attributes.position;
  const totalVertices = posAttr.count;
  const particleCount = Math.floor(PERFORMANCE_CONFIG.maxVerticesPerModel * getParticleMultiplier());
  const sampleIndices: number[] = [];
  const step = Math.max(1, Math.ceil(totalVertices / particleCount));
  for (let i = 0; i < totalVertices && sampleIndices.length < particleCount; i++) {
    if (i % step === 0) {
      sampleIndices.push(i);
    }
  }

  // Extract initial frame positions
  const initialPositions = new Float32Array(sampleIndices.length * 3);
  const target = new THREE.Vector3();
  for (let j = 0; j < sampleIndices.length; j++) {
    const vertIdx = sampleIndices[j];
    target.fromBufferAttribute(posAttr, vertIdx);
    mesh.applyBoneTransform(vertIdx, target);
    target.applyMatrix4(mesh.matrixWorld);
    initialPositions[j * 3] = target.x;
    initialPositions[j * 3 + 1] = target.y;
    initialPositions[j * 3 + 2] = target.z;
  }

  // Compute normalization scale (8-unit normalization, same as ParticleMorpher)
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < sampleIndices.length; i++) {
    const i3 = i * 3;
    const x = initialPositions[i3], y = initialPositions[i3 + 1], z = initialPositions[i3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const maxDimension = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const normalizeScale = 8 / maxDimension;

  console.log(`FBX loaded: ${totalVertices} total vertices, ${sampleIndices.length} sampled, normalizeScale=${normalizeScale.toFixed(4)}`);

  return { fbx, mixer, mesh, sampleIndices, normalizeScale, initialPositions };
}

/**
 * Register a per-frame walking animation updater on a ParticleMorpher shape.
 */
export function registerWalkingUpdater(
  morpher: { getShapeTargets: () => { positions: Float32Array }[]; setShapeUpdater: (idx: number, fn: (delta: number) => void) => void },
  shapeIdx: number,
  walkData: FBXWalkingData,
  modelScale: number,
) {
  const shapeTargets = morpher.getShapeTargets();
  const humanShape = shapeTargets[shapeIdx];
  if (!humanShape) {
    console.warn(`registerWalkingUpdater: shape index ${shapeIdx} not found`);
    return;
  }

  const { mixer, mesh, sampleIndices, normalizeScale } = walkData;
  const finalScale = normalizeScale * modelScale;
  const posAttr = mesh.geometry.attributes.position;
  const target = new THREE.Vector3();

  const numSamples = sampleIndices.length;
  const totalParticles = humanShape.positions.length / 3;

  morpher.setShapeUpdater(shapeIdx, (delta: number) => {
    mixer.update(delta);
    walkData.fbx.updateMatrixWorld(true);
    if (mesh.skeleton) mesh.skeleton.update();

    const positions = humanShape.positions;
    for (let j = 0; j < numSamples; j++) {
      const vertIdx = sampleIndices[j];
      target.fromBufferAttribute(posAttr, vertIdx);
      mesh.applyBoneTransform(vertIdx, target);
      target.applyMatrix4(mesh.matrixWorld);

      positions[j * 3] = target.x * finalScale;
      positions[j * 3 + 1] = target.y * finalScale;
      positions[j * 3 + 2] = target.z * finalScale;
    }

    // 초과 파티클은 (0,0,0)으로 채움 (activeCount로 비활성 처리됨)
    for (let j = numSamples; j < totalParticles; j++) {
      positions[j * 3] = 0;
      positions[j * 3 + 1] = 0;
      positions[j * 3 + 2] = 0;
    }
  });

  console.log(`Walking animation updater registered for shape ${shapeIdx}`);
}
