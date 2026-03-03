import GUI from 'lil-gui';
import { SceneManager } from '../scene/SceneManager';
import { models, particleConfig, backgroundConfig } from '../config/sceneConfig';

export class DebugPanel {
  private gui: GUI;

  constructor(sceneManager: SceneManager) {
    this.gui = new GUI({ title: 'Particle Debug' });

    // Wait for models to load before building UI
    setTimeout(() => this.buildUI(sceneManager), 1500);
  }

  private buildUI(sceneManager: SceneManager) {
    const modelShapes = sceneManager.getModels();
    const isDev = import.meta.env.DEV;

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
      .add(particleConfig, 'depthNearMul', 0.1, 3.0, 0.1)
      .name('Near Size (×)');

    if (isDev) {
      globalFolder
        .add(particleConfig, 'depthFarMul', 0.1, 5.0, 0.1)
        .name('Far Size (×)');
    }

    globalFolder
      .add(globalParams, 'mouseRadius', 0.05, 2.0, 0.01)
      .name('Dome Radius')
      .onChange((v: number) => { particleConfig.mouseRadius = v; });

    if (isDev) {
      globalFolder
        .add(particleConfig, 'activationRadius', 1.0, 10.0, 0.5)
        .name('Activation Radius');
    }

    if (isDev) {
      globalFolder
        .add(particleConfig, 'showDomeDebug')
        .name('Show Dome Area');
    }

    globalFolder
      .add(globalParams, 'mouseStrength', 0.1, 3.0, 0.05)
      .name('Scatter Strength')
      .onChange((v: number) => { particleConfig.mouseStrength = v; });

    if (isDev) {
      globalFolder
        .add(particleConfig, 'parallaxStrength', 0, 0.5, 0.01)
        .name('Parallax');
    }

    // Size effect: dev only
    if (isDev) {
      const sizeFolder = globalFolder.addFolder('Size Effect');
      sizeFolder
        .add(particleConfig, 'mouseSizeEffect')
        .name('Enable');
      sizeFolder
        .add(particleConfig, 'mouseSizeStrength', 0, 2.0, 0.05)
        .name('Strength');
    }

    // Orbit & Spring: dev only
    if (isDev) {
      const orbitFolder = globalFolder.addFolder('Orbit');
      orbitFolder
        .add(particleConfig, 'orbitSpeed', 0, 6.0, 0.1)
        .name('Speed');
      orbitFolder
        .add(particleConfig, 'orbitStrength', 0, 1.0, 0.01)
        .name('Strength');

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
    }

    globalFolder.open();

    // Background particles folder
    const bg = sceneManager.getBackground();
    const bgFolder = this.gui.addFolder('Background');
    const bgParams = {
      enabled: bg.visible,
      count: backgroundConfig.count,
      radius: backgroundConfig.radius,
      height: backgroundConfig.height,
      minRadius: backgroundConfig.minRadius,
      size: backgroundConfig.size,
      opacity: backgroundConfig.opacity,
    };

    bgFolder
      .add(bgParams, 'enabled')
      .name('Enable')
      .onChange((v: boolean) => { backgroundConfig.enabled = v; bg.visible = v; });

    if (isDev) {
      bgFolder
        .add(bgParams, 'count', 0, 1000, 10)
        .name('Count')
        .onChange((v: number) => { backgroundConfig.count = v; bg.rebuild(); });

      bgFolder
        .add(bgParams, 'radius', 5, 50, 1)
        .name('Radius')
        .onChange((v: number) => { backgroundConfig.radius = v; bg.rebuild(); });

      bgFolder
        .add(bgParams, 'height', 5, 60, 1)
        .name('Height')
        .onChange((v: number) => { backgroundConfig.height = v; bg.rebuild(); });

      bgFolder
        .add(bgParams, 'minRadius', 0, 20, 1)
        .name('Min Radius')
        .onChange((v: number) => { backgroundConfig.minRadius = v; bg.rebuild(); });

      bgFolder
        .add(bgParams, 'size', 0.005, 0.1, 0.005)
        .name('Size')
        .onChange((v: number) => { backgroundConfig.size = v; bg.rebuild(); });

      bgFolder
        .add(bgParams, 'opacity', 0, 1, 0.05)
        .name('Opacity')
        .onChange((v: number) => { backgroundConfig.opacity = v; bg.rebuild(); });
    }

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
