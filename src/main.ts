import './style.css';
import { SceneManager } from './scene/SceneManager';

// Initialize the scene when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Dev-only debug panel (tree-shaken in production)
  if (import.meta.env.DEV) {
    import('./debug/DebugPanel').then(({ DebugPanel }) => {
      new DebugPanel(sceneManager);
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
