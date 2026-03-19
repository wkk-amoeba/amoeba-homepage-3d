import GUI from 'lil-gui';
import { SceneManager } from '../scene/SceneManager';
import { particleConfig, backgroundConfig, animationPhases } from '../config/sceneConfig';
import { getActiveUnifiedConfig } from '../utils/sphereUnified';

export class DebugPanel {
  private gui: GUI;

  constructor(sceneManager: SceneManager) {
    this.gui = new GUI({ title: 'Particle Debug' });

    // Collapse by default in production (build:debug)
    if (!import.meta.env.DEV) {
      this.gui.close();
    }

    // Wait for models to load before building UI
    setTimeout(() => this.buildUI(sceneManager), 1500);
  }

  private buildUI(sceneManager: SceneManager) {
    const morpher = sceneManager.getMorpher();
    if (!morpher) return;

    const isDev = import.meta.env.DEV;

    // Global Settings folder
    const globalFolder = this.gui.addFolder('Global Settings');
    const globalParams = {
      particleSize: particleConfig.size,
      scale: morpher.userScale,
      mouseRadius: particleConfig.mouseRadius,
      mouseStrength: particleConfig.mouseStrength,
    };

    globalFolder
      .add(globalParams, 'particleSize', 0.01, 0.15, 0.005)
      .name('Particle Size')
      .onChange((v: number) => { morpher.particleSize = v; });

    globalFolder
      .add(globalParams, 'scale', 0.1, 3.0, 0.05)
      .name('Scale')
      .onChange((v: number) => { morpher.userScale = v; });

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
      .add(particleConfig, 'microNoiseAmp', 0, 0.1, 0.001)
      .name('Micro Orbit Radius');

    globalFolder
      .add(particleConfig, 'microNoiseSpeed', 0, 3.0, 0.05)
      .name('Micro Orbit Speed');

    globalFolder
      .add(particleConfig, 'mouseAttract')
      .name('Attract (vs Scatter)');

    globalFolder
      .add(globalParams, 'mouseStrength', 0.1, 3.0, 0.05)
      .name('Mouse Strength')
      .onChange((v: number) => { particleConfig.mouseStrength = v; });

    globalFolder
      .add(particleConfig, 'scatterScale', 0.01, 1.0, 0.01)
      .name('Scatter Range');

    if (isDev) {
      globalFolder
        .add(particleConfig, 'parallaxStrength', 0, 0.5, 0.01)
        .name('Parallax');
    }

    // Animation phases
    if (isDev) {
      const phaseFolder = globalFolder.addFolder('Animation Phases');
      const exitCtrl = phaseFolder
        .add(animationPhases, 'exitRatio', 0.05, 0.5, 0.05)
        .name('Exit')
        .disable();

      phaseFolder
        .add(animationPhases, 'enterRatio', 0.05, 0.5, 0.05)
        .name('Enter')
        .onChange(() => {
          animationPhases.exitRatio = Math.max(0.05, 1 - animationPhases.enterRatio - animationPhases.holdRatio);
          exitCtrl.updateDisplay();
        });
      phaseFolder
        .add(animationPhases, 'holdRatio', 0.1, 0.8, 0.05)
        .name('Hold')
        .onChange(() => {
          animationPhases.exitRatio = Math.max(0.05, 1 - animationPhases.enterRatio - animationPhases.holdRatio);
          exitCtrl.updateDisplay();
        });
    }

    // Transition rotation
    if (isDev) {
      const transFolder = globalFolder.addFolder('Transition Rotation');
      transFolder
        .add(particleConfig, 'transitionRotation')
        .name('Enable');
      transFolder
        .add(particleConfig, 'transitionRotationSpeed', 0.5, 10.0, 0.5)
        .name('Speed');
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

    // Background reference (needed for lighting sync)
    const bg = sceneManager.getBackground();

    // Lighting folder
    const lightFolder = globalFolder.addFolder('Lighting');
    const lightParams = {
      dirX: particleConfig.lightDirection[0],
      dirY: particleConfig.lightDirection[1],
      dirZ: particleConfig.lightDirection[2],
      ambient: particleConfig.lightAmbient,
      diffuse: particleConfig.lightDiffuse,
      specular: particleConfig.lightSpecular,
      shininess: particleConfig.lightShininess,
    };

    const updateLightDir = () => {
      morpher.setLightDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
      bg.setLightDirection(lightParams.dirX, lightParams.dirY, lightParams.dirZ);
    };

    lightFolder.add(lightParams, 'dirX', -1, 1, 0.05).name('Direction X').onChange(updateLightDir);
    lightFolder.add(lightParams, 'dirY', -1, 1, 0.05).name('Direction Y').onChange(updateLightDir);
    lightFolder.add(lightParams, 'dirZ', -1, 1, 0.05).name('Direction Z').onChange(updateLightDir);
    lightFolder.add(lightParams, 'ambient', 0, 1, 0.05).name('Ambient').onChange((v: number) => {
      morpher.setLightAmbient(v);
      bg.setLightAmbient(v);
    });
    lightFolder.add(lightParams, 'diffuse', 0, 1, 0.05).name('Diffuse').onChange((v: number) => {
      morpher.setLightDiffuse(v);
      bg.setLightDiffuse(v);
    });
    lightFolder.add(lightParams, 'specular', 0, 2, 0.05).name('Specular').onChange((v: number) => {
      morpher.setLightSpecular(v);
    });
    lightFolder.add(lightParams, 'shininess', 1, 128, 1).name('Shininess').onChange((v: number) => {
      morpher.setLightShininess(v);
    });

    globalFolder.open();

    // Background particles folder
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

      bgFolder
        .add(backgroundConfig, 'exclusionRadius', 0, 3, 0.05)
        .name('Exclusion R')
        .onChange((v: number) => { bg.setExclusionRadius(v); });

      bgFolder
        .add(backgroundConfig, 'exclusionFade', 0, 1, 0.05)
        .name('Exclusion Fade')
        .onChange((v: number) => { bg.setExclusionFade(v); });
    }

    // Per-shape position folders
    const shapeTargets = morpher.getShapeTargets();
    shapeTargets.forEach((shape, index) => {
      const folder = this.gui.addFolder(`${index}: ${shape.name}`);

      const params = {
        posX: shape.worldOffset.x,
        posY: shape.worldOffset.y,
        posZ: shape.worldOffset.z,
        holdScatter: shape.holdScatter,
      };

      folder
        .add(params, 'posX', -10, 10, 0.1)
        .name('Position X')
        .onChange((v: number) => { morpher.setShapePosition(index, v, params.posY, params.posZ); });

      folder
        .add(params, 'posY', -10, 10, 0.1)
        .name('Position Y')
        .onChange((v: number) => { morpher.setShapePosition(index, params.posX, v, params.posZ); });

      folder
        .add(params, 'posZ', -10, 10, 0.1)
        .name('Position Z')
        .onChange((v: number) => { morpher.setShapePosition(index, params.posX, params.posY, v); });

      // Unified Sphere controls (deform + metaball orbital + metaball linear)
      const unifiedCfg = shape.name === 'Sphere' ? getActiveUnifiedConfig() : null;

      if (!unifiedCfg) {
        // Non-unified shapes: single holdScatter
        folder
          .add(params, 'holdScatter', 0, 0.1, 0.001)
          .name('Hold Scatter')
          .onChange((v: number) => { shape.holdScatter = v; });
      }
      if (shape.autoRotateSpeed !== undefined) {
        folder
          .add(shape, 'autoRotateSpeed', 0, 1.0, 0.01)
          .name('Auto Rotate Speed');
      }
      if (unifiedCfg) {
        folder.add(unifiedCfg, 'transitionWidth', 0, 0.3, 0.01).name('Transition Width');
        folder.add(unifiedCfg, 'subSection1', 0.05, 0.5, 0.05).name('Sub1 (Deform→Orb)');
        folder.add(unifiedCfg, 'subSection2', 0.1, 0.8, 0.05).name('Sub2 (Orb→Linear)');

        folder.add(unifiedCfg, 'deformHoldScatter', 0, 0.1, 0.001).name('Scatter: Deform');
        folder.add(unifiedCfg, 'orbitalHoldScatter', 0, 0.1, 0.001).name('Scatter: Orbital');
        folder.add(unifiedCfg, 'orbital2HoldScatter', 0, 0.1, 0.001).name('Scatter: 위성');

        if (shape.depthSize) {
          const ds = shape.depthSize;
          folder.add(ds, 'min', 0, 1.0, 0.05).name('Depth Size Min');
          folder.add(ds, 'max', 0, 2.0, 0.05).name('Depth Size Max');
        }

        const deformFolder = folder.addFolder('Deform');
        const dc = unifiedCfg.deform;
        deformFolder.add(dc, 'maxDeform', 0, 1.0, 0.01).name('Max Deform');
        deformFolder.add(dc, 'noiseScale', 0.5, 8.0, 0.1).name('Noise Scale');
        deformFolder.add(dc, 'breathSpeed', 0.05, 2.0, 0.05).name('Breath Speed');
        deformFolder.add(dc, 'breathMin', 0, 1.0, 0.05).name('Breath Min');
        deformFolder.add(dc, 'breathMax', 0, 1.0, 0.05).name('Breath Max');
        deformFolder.add(dc, 'noiseSpeed', 0, 1.0, 0.01).name('Noise Speed');

        const mbFolder = folder.addFolder('Metaball Orbital');
        const mc = unifiedCfg.metaball;
        mbFolder.add(mc, 'mainRadius', 0.5, 3.0, 0.05).name('Main Radius');
        mbFolder.add(mc, 'bobAmplitude', 0, 1.0, 0.05).name('Bob Amplitude');
        mbFolder.add(mc, 'bobSpeed', 0.1, 3.0, 0.1).name('Bob Speed');
        mbFolder.add(mc, 'satelliteCount', 1, 8, 1).name('Satellites');
        mbFolder.add(mc, 'satelliteRadius', 0.1, 1.5, 0.05).name('Sat Radius');
        mbFolder.add(mc, 'orbitRadius', 0.5, 4.0, 0.1).name('Orbit Radius');
        mbFolder.add(mc, 'orbitSpeed', 0.1, 3.0, 0.1).name('Orbit Speed');
        mbFolder.add(mc, 'threshold', 0.5, 2.0, 0.05).name('Threshold');

        const o2Folder = folder.addFolder('위성 (Linear Split)');
        const o2 = unifiedCfg.orbital2;
        o2Folder.add(o2, 'mainRadius', 0.5, 3.0, 0.05).name('Main Radius');
        o2Folder.add(o2, 'bobAmplitude', 0, 1.0, 0.05).name('Bob Amplitude');
        o2Folder.add(o2, 'bobSpeed', 0.1, 3.0, 0.1).name('Bob Speed');
        o2Folder.add(o2, 'satelliteCount', 1, 8, 1).name('Satellites');
        o2Folder.add(o2, 'satelliteRadius', 0.1, 1.5, 0.05).name('Sat Radius');
        o2Folder.add(o2, 'travelDistance', 0.5, 5.0, 0.1).name('Travel Dist');
        o2Folder.add(o2, 'travelSpeed', 0.1, 3.0, 0.1).name('Travel Speed');
        o2Folder.add(o2, 'threshold', 0.5, 2.0, 0.05).name('Threshold');
      }

      // Gravity fall controls
      if (shape.enterTransition?.gravity) {
        const gravFolder = folder.addFolder('Gravity Fall');
        const et = shape.enterTransition;
        gravFolder.add(et, 'gravityHeight', 1, 20, 0.5).name('Height');
        gravFolder.add(et, 'gravityDuration', 0.5, 10, 0.1).name('Duration (s)');
        gravFolder.add(et, 'gravityWobbleFreq', 0, 12, 0.5).name('Wobble Freq');
        gravFolder.add({ replay: () => { morpher.resetGravitySettle(); } }, 'replay').name('▶ Replay');
      }

      folder.open();
    });

    // Particle count info
    this.gui.add({ particles: morpher.totalParticleCount }, 'particles')
      .name('Total Particles')
      .disable();
  }

  destroy() {
    this.gui.destroy();
  }
}
