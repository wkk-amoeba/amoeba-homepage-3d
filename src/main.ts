import './style.css';
import { SceneManager } from './scene/SceneManager';

// Initialize the scene when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
