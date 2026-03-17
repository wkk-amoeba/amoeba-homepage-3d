import './style.css';
import { SceneManager } from './scene/SceneManager';
import { models } from './config/sceneConfig';
import { loadFBXWalking, registerWalkingUpdater } from './utils/fbxWalking';
import { registerSphereDeform } from './utils/sphereDeform';
import { registerSphereMetaball, registerSphereMetaballLinear } from './utils/sphereMetaball';

// Main
document.addEventListener('DOMContentLoaded', async () => {

  // Load FBX walking data and inject into Human model config
  const humanModel = models.find((m) => m.name === 'Human');
  let walkData: Awaited<ReturnType<typeof loadFBXWalking>> | null = null;

  if (humanModel && !humanModel.modelPath && !humanModel.precomputedPositions) {
    walkData = await loadFBXWalking();
    humanModel.precomputedPositions = walkData.initialPositions;
  }

  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Register shape updaters
  const morpher = sceneManager.getMorpher();
  if (morpher) {
    await morpher.ready;

    // Walking animation
    if (walkData && humanModel) {
      const humanIdx = models.indexOf(humanModel);
      registerWalkingUpdater(morpher, humanIdx, walkData, humanModel.scale);
    }

    // Sphere deformation (crumple breathing) & metaball
    models.forEach((m, idx) => {
      if (m.name === 'Sphere') registerSphereDeform(morpher, idx);
      if (m.name === 'Sphere2') registerSphereMetaball(morpher, idx);
      if (m.name === 'Sphere3') registerSphereMetaballLinear(morpher, idx);
    });
  }

  // Always show debug panel in experiment page
  import('./debug/DebugPanel').then(({ DebugPanel }) => {
    new DebugPanel(sceneManager);
  });

  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
