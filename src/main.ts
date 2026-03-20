import './style.css';
import { SceneManager } from './scene/SceneManager';
import { models } from './config/sceneConfig';
import { loadFBXWalking, registerWalkingUpdater } from './utils/fbxWalking';
import { registerUnifiedSphere } from './utils/sphereUnified';

// Initialize the scene when DOM is ready
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
      registerWalkingUpdater(morpher, humanIdx, walkData, humanModel.scale, humanModel.rotation);
    }

    // Unified sphere: scroll-driven effect interpolation (deform → metaball → linear)
    const sphereIdx = models.findIndex((m) => m.name === 'Sphere');
    if (sphereIdx >= 0) {
      registerUnifiedSphere(morpher, sphereIdx);
    }
  }

  // Debug panel: enabled in dev mode and build:debug (tree-shaken in production build)
  if (__DEBUG_PANEL__) {
    import('./debug/DebugPanel').then(({ DebugPanel }) => {
      new DebugPanel(sceneManager);
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
