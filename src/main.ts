import './style.css';
import { SceneManager } from './scene/SceneManager';
import { models } from './config/sceneConfig';
import { registerUnifiedSphere } from './utils/sphereUnified';
import { generateHelixBarPositions, registerHelixBarUpdater } from './utils/helixBarUpdater';

// Initialize the scene when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Inject programmatic positions before SceneManager loads models
  const twistBar = models.find((m) => m.name === 'TwistBar');
  if (twistBar) {
    twistBar.precomputedPositions = generateHelixBarPositions();
  }

  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  // Register shape updaters
  const morpher = sceneManager.getMorpher();
  if (morpher) {
    await morpher.ready;

    // Unified sphere: scroll-driven effect interpolation (deform → metaball → linear)
    const sphereIdx = models.findIndex((m) => m.name === 'Sphere');
    if (sphereIdx >= 0) {
      registerUnifiedSphere(morpher, sphereIdx);
    }

    // Helix bar: 타원형 나선 경로를 따라 막대들이 무한히 내려오는 애니메이션
    const twistBarIdx = models.findIndex((m) => m.name === 'TwistBar');
    if (twistBarIdx >= 0) {
      registerHelixBarUpdater(morpher, twistBarIdx);
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
