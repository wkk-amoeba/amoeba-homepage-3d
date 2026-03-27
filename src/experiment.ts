import './style.css';
import { SceneManager } from './scene/SceneManager';

// Main
document.addEventListener('DOMContentLoaded', async () => {
  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Register shape updaters
  // Always show debug panel in experiment page
  import('./debug/DebugPanel').then(({ DebugPanel }) => {
    new DebugPanel(sceneManager);
  });

  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
