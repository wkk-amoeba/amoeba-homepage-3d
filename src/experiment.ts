import './style.css';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SceneManager } from './scene/SceneManager';
import { models, scrollConfig, ModelData, PERFORMANCE_CONFIG, getParticleMultiplier } from './config/sceneConfig';

interface FBXWalkingData {
  fbx: THREE.Group;
  mixer: THREE.AnimationMixer;
  mesh: THREE.SkinnedMesh;
  sampleIndices: number[];
  normalizeScale: number;
  initialPositions: Float32Array;
}

/**
 * Load Walking.fbx, setup AnimationMixer, compute normalization,
 * and return everything needed for per-frame vertex extraction.
 */
async function loadFBXWalking(): Promise<FBXWalkingData> {
  const loader = new FBXLoader();
  const fbx = await loader.loadAsync('/models/Walking.fbx');

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
  if (fbx.animations.length > 0) {
    const clip = fbx.animations[0];

    // Strip root motion (zero X/Z on Hips position track)
    clip.tracks = clip.tracks.filter((track) => {
      if (track.name.endsWith('.position')) {
        const boneName = track.name.split('.')[0];
        if (boneName.includes('Hips') || boneName.includes('hips')) {
          const values = track.values;
          for (let i = 0; i < values.length; i += 3) {
            values[i] = 0;
            values[i + 2] = 0;
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

// Main
document.addEventListener('DOMContentLoaded', async () => {
  // Override scroll config for 4 models
  scrollConfig.sectionGap = 0.25;
  scrollConfig.sectionDuration = 0.25;
  scrollConfig.modelCount = 4;

  const humanScale = 0.35;

  // Load FBX and extract initial frame
  const walkData = await loadFBXWalking();

  // Build 4-model config: 3 existing + human (initial frame as precomputedPositions)
  const humanModel: ModelData = {
    id: 3,
    name: 'Human',
    precomputedPositions: walkData.initialPositions,
    scale: humanScale,
    position: [0, -1.4, 0],
  };

  // Replace global models array with 4 models
  models.length = 0;
  models.push(
    { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, position: [0, 0, 0] },
    { id: 1, name: 'Box', modelPath: '/models/high_cube.glb', scale: 0.27, position: [0.8, -0.7, 0] },
    { id: 2, name: 'Cone', modelPath: '/models/high_cone.glb', scale: 0.315, position: [0, 0, 0] },
    humanModel,
  );

  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Register per-frame walking animation updater on the human shape (index 3)
  const morpher = sceneManager.getMorpher();
  if (morpher) {
    await morpher.ready;
    const shapeTargets = morpher.getShapeTargets();
    const humanShape = shapeTargets[3];

    if (humanShape) {
      const { mixer, mesh, sampleIndices, normalizeScale } = walkData;
      const finalScale = normalizeScale * humanScale;
      const posAttr = mesh.geometry.attributes.position;
      const target = new THREE.Vector3();

      const numSamples = sampleIndices.length;
      const totalParticles = humanShape.positions.length / 3;

      morpher.setShapeUpdater(3, (delta: number) => {
        // Advance animation
        mixer.update(delta);
        walkData.fbx.updateMatrixWorld(true);
        if (mesh.skeleton) mesh.skeleton.update();

        // Extract skinned vertex positions and write to shape's positions array
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

        // Fill padded positions (if particleCount > numSamples)
        for (let j = numSamples; j < totalParticles; j++) {
          const src = (j % numSamples) * 3;
          positions[j * 3] = positions[src];
          positions[j * 3 + 1] = positions[src + 1];
          positions[j * 3 + 2] = positions[src + 2];
        }
      });

      console.log('Walking animation updater registered for Human shape');
    }
  }

  // Always show debug panel in experiment page
  import('./debug/DebugPanel').then(({ DebugPanel }) => {
    new DebugPanel(sceneManager);
  });

  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
