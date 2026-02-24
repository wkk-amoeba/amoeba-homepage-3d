import GUI from 'lil-gui';
import { SceneManager } from '../scene/SceneManager';
import { models } from '../config/sceneConfig';

export class DebugPanel {
  private gui: GUI;

  constructor(sceneManager: SceneManager) {
    this.gui = new GUI({ title: 'Particle Debug' });

    // Wait for models to load before building UI
    setTimeout(() => this.buildUI(sceneManager), 1500);
  }

  private buildUI(sceneManager: SceneManager) {
    const modelShapes = sceneManager.getModels();

    modelShapes.forEach((model, index) => {
      if (model.totalParticleCount === 0) return;

      const folder = this.gui.addFolder(`${index}: ${model.name}`);

      const params = {
        scale: model.userScale,
        particles: model.visibleParticleCount,
      };

      folder
        .add(params, 'scale', 0.1, 3.0, 0.05)
        .name('Scale')
        .onChange((v: number) => { model.userScale = v; });

      folder
        .add(params, 'particles', 100, model.totalParticleCount, 100)
        .name(`Particles (max ${model.totalParticleCount})`)
        .onChange((v: number) => { model.visibleParticleCount = v; });

      folder.open();
    });

    // Export button
    this.gui.add({ export: () => this.exportConfig(modelShapes) }, 'export').name('Export Config');
  }

  private exportConfig(modelShapes: ReturnType<SceneManager['getModels']>) {
    const config = modelShapes.map((model, i) => ({
      name: model.name,
      scale: model.userScale * models[i].scale,
      particleCount: model.visibleParticleCount,
    }));

    console.log('\n--- sceneConfig.ts models update ---');
    config.forEach((c) => {
      console.log(`  { name: '${c.name}', scale: ${c.scale.toFixed(2)}, particleCount: ${c.particleCount} }`);
    });
    console.log('------------------------------------\n');
  }

  destroy() {
    this.gui.destroy();
  }
}
