import './style.css';
import { SceneManager } from './scene/SceneManager';
import { models } from './config/sceneConfig';
import { loadFBXWalking, registerWalkingUpdater } from './utils/fbxWalking';

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

  // Register walking animation updater
  if (walkData && humanModel) {
    const morpher = sceneManager.getMorpher();
    if (morpher) {
      await morpher.ready;
      const humanIdx = models.indexOf(humanModel);
      registerWalkingUpdater(morpher, humanIdx, walkData, humanModel.scale);
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
