import './style.css';
import { SceneManager } from './scene/SceneManager';

// Initialize the scene when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

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
