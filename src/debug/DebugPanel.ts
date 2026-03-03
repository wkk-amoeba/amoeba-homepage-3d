import GUI from 'lil-gui';
import { SceneManager } from '../scene/SceneManager';
import { models, particleConfig } from '../config/sceneConfig';

export class DebugPanel {
  private gui: GUI;

  constructor(sceneManager: SceneManager) {
    this.gui = new GUI({ title: 'Particle Debug' });

    // Wait for models to load before building UI
    setTimeout(() => this.buildUI(sceneManager), 1500);
  }

  private buildUI(sceneManager: SceneManager) {
    const modelShapes = sceneManager.getModels();

    // Global Settings folder
    const globalFolder = this.gui.addFolder('Global Settings');
    const globalParams = {
      particleSize: particleConfig.size,
      mouseRadius: particleConfig.mouseRadius,
      mouseStrength: particleConfig.mouseStrength,
    };

    globalFolder
      .add(globalParams, 'particleSize', 0.01, 0.15, 0.005)
      .name('Particle Size')
      .onChange((v: number) => {
        modelShapes.forEach(model => { model.particleSize = v; });
      });

    globalFolder
      .add(particleConfig, 'depthNearMul', 0.1, 5.0, 0.1)
      .name('Near Size (×)');

    globalFolder
      .add(particleConfig, 'depthFarMul', 0.1, 5.0, 0.1)
      .name('Far Size (×)');

    globalFolder
      .add(globalParams, 'mouseRadius', 0.05, 0.8, 0.01)
      .name('Dome Radius')
      .onChange((v: number) => { particleConfig.mouseRadius = v; });

    globalFolder
      .add(particleConfig, 'activationRadius', 1.0, 10.0, 0.5)
      .name('Activation Radius');

    globalFolder
      .add(particleConfig, 'showDomeDebug')
      .name('Show Dome Area');

    globalFolder
      .add(globalParams, 'mouseStrength', 0.1, 3.0, 0.05)
      .name('Bulge Strength')
      .onChange((v: number) => { particleConfig.mouseStrength = v; });


    // // Particle mode switch (tetrahedron mode disabled)
    // const modeParams = { mode: particleConfig.mode };
    // globalFolder
    //   .add(modeParams, 'mode', ['dots', 'tetrahedron'])
    //   .name('Particle Mode')
    //   .onChange((v: ParticleMode) => {
    //     particleConfig.mode = v;
    //     modelShapes.forEach(model => model.setMode(v));
    //   });

    // // Tetrahedron settings
    // const tetraFolder = globalFolder.addFolder('Tetrahedron');
    // tetraFolder
    //   .add(particleConfig, 'tetrahedronSize', 0.01, 0.2, 0.005)
    //   .name('Size');
    // tetraFolder
    //   .add(particleConfig, 'tetrahedronRotationSpeed', 0, 2, 0.05)
    //   .name('Rotation Speed');

    // Orbit settings
    const orbitFolder = globalFolder.addFolder('Orbit');
    orbitFolder
      .add(particleConfig, 'orbitSpeed', 0, 6.0, 0.1)
      .name('Speed');
    orbitFolder
      .add(particleConfig, 'orbitStrength', 0, 1.0, 0.01)
      .name('Strength');

    // Spring physics settings
    const springFolder = globalFolder.addFolder('Spring Physics');
    springFolder
      .add(particleConfig, 'springEnabled')
      .name('Enable Spring');
    springFolder
      .add(particleConfig, 'springStiffness', 20, 500, 5)
      .name('Stiffness');
    springFolder
      .add(particleConfig, 'springDamping', 1, 30, 0.5)
      .name('Damping');

    globalFolder.open();

    // Per-model folders
    modelShapes.forEach((model, index) => {
      if (model.totalParticleCount === 0) return;

      const folder = this.gui.addFolder(`${index}: ${model.name}`);

      // Read current values (already includes localStorage overrides applied by ModelShape)
      const params = {
        scale: model.userScale,
        rotX: model.rotationX,
        rotY: model.rotationY,
        rotZ: model.rotationZ,
        particles: model.visibleParticleCount,
      };

      folder
        .add(params, 'scale', 0.1, 3.0, 0.05)
        .name('Scale')
        .onChange((v: number) => { model.userScale = v; });

      folder
        .add(params, 'rotX', -Math.PI, Math.PI, 0.01)
        .name('Rotation X')
        .onChange((v: number) => { model.rotationX = v; });

      folder
        .add(params, 'rotY', -Math.PI, Math.PI, 0.01)
        .name('Rotation Y')
        .onChange((v: number) => { model.rotationY = v; });

      folder
        .add(params, 'rotZ', -Math.PI, Math.PI, 0.01)
        .name('Rotation Z')
        .onChange((v: number) => { model.rotationZ = v; });

      folder
        .add(params, 'particles', 100, model.totalParticleCount, 100)
        .name(`Particles (max ${model.totalParticleCount})`)
        .onChange((v: number) => { model.visibleParticleCount = v; });

      folder.add({
        set: () => {
          const data = {
            scale: model.userScale,
            rotX: model.rotationX,
            rotY: model.rotationY,
            rotZ: model.rotationZ,
            particles: model.visibleParticleCount,
          };
          localStorage.setItem(`debug_model_${model.name}`, JSON.stringify(data));
          console.log(`Saved debug values for ${model.name}:`, data);
        },
      }, 'set').name('Set');

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
      rotation: { x: model.rotationX, y: model.rotationY, z: model.rotationZ },
    }));

    console.log('\n--- sceneConfig.ts models update ---');
    config.forEach((c) => {
      console.log(`  { name: '${c.name}', scale: ${c.scale.toFixed(2)}, particleCount: ${c.particleCount}, rotation: [${c.rotation.x.toFixed(2)}, ${c.rotation.y.toFixed(2)}, ${c.rotation.z.toFixed(2)}] }`);
    });
    console.log('------------------------------------\n');
  }

  destroy() {
    this.gui.destroy();
  }
}
