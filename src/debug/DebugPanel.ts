import GUI from 'lil-gui';
import { SceneManager } from '../scene/SceneManager';
import { particleConfig, backgroundConfig, animationPhases } from '../config/sceneConfig';


const STORAGE_KEY = 'particle-debug-settings';

interface SavedSettings {
  globalLighting: { dirX: number; dirY: number; dirZ: number; ambient: number; diffuse: number; specular: number; shininess: number };
  scene1: { depthMin: number; depthMax: number; particleSize: number };
  scene3: { shapeScale: number };
  shapeScales?: Record<string, number>;
}

function loadSettings(): SavedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSettings(s: SavedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function exportSettings(s: SavedSettings) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `particle-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}


export class DebugPanel {
  private gui: GUI;
  private animFrameId: number | null = null;

  constructor(sceneManager: SceneManager) {
    this.gui = new GUI({ title: 'Particle Debug' });

    // Collapse by default in production
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
    const bg = sceneManager.getBackground();
    const shapeTargets = morpher.getShapeTargets();

    // ── Production controls (always visible) ──

    const sphereShape = shapeTargets.find(s => s.name === 'SphereDeform');
    const gyroIdx = shapeTargets.findIndex(s => s.name === 'Gyro');
    const gyroShape = gyroIdx >= 0 ? shapeTargets[gyroIdx] : null;

    // Restore saved settings
    const saved = loadSettings();
    console.log('[DebugPanel] restore:', saved);
    if (saved) {
      // Global Lighting
      const gl = saved.globalLighting;
      particleConfig.lightDirection[0] = gl.dirX;
      particleConfig.lightDirection[1] = gl.dirY;
      particleConfig.lightDirection[2] = gl.dirZ;
      particleConfig.lightAmbient = gl.ambient;
      particleConfig.lightDiffuse = gl.diffuse;
      particleConfig.lightSpecular = gl.specular;
      particleConfig.lightShininess = gl.shininess;
      morpher.setLightDirection(gl.dirX, gl.dirY, gl.dirZ);
      morpher.setLightAmbient(gl.ambient);
      morpher.setLightDiffuse(gl.diffuse);
      morpher.setLightSpecular(gl.specular);
      morpher.setLightShininess(gl.shininess);
      bg.setLightDirection(gl.dirX, gl.dirY, gl.dirZ);
      bg.setLightAmbient(gl.ambient);
      bg.setLightDiffuse(gl.diffuse);

      // Scene 1
      const s1 = saved.scene1;
      if (sphereShape?.depthSize) {
        sphereShape.depthSize.min = s1.depthMin;
        sphereShape.depthSize.max = s1.depthMax;
      }
      morpher.particleSize = s1.particleSize;

      // Scene 3
      if (gyroShape && gyroShape.configScale > 0) {
        gyroShape.shapeScale = saved.scene3.shapeScale / gyroShape.configScale;
      }

      // All shape scales (저장값 = configScale * shapeScale → shapeScale 복원)
      if (saved.shapeScales) {
        for (const shape of shapeTargets) {
          if (saved.shapeScales[shape.name] !== undefined && shape.configScale > 0) {
            shape.shapeScale = saved.shapeScales[shape.name] / shape.configScale;
          }
        }
      }
    }

    // Global Lighting
    const lightFolder = this.gui.addFolder('Global Lighting');
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
    lightFolder.open();

    const sizeParams = { size: morpher.particleSize };
    const collectSettings = (): SavedSettings => ({
      globalLighting: { ...lightParams },
      scene1: {
        depthMin: sphereShape?.depthSize?.min ?? 0.1,
        depthMax: sphereShape?.depthSize?.max ?? 0.7,
        particleSize: morpher.particleSize,
      },
      scene3: { shapeScale: (gyroShape?.configScale ?? 1) * (gyroShape?.shapeScale ?? 1) },
      shapeScales: Object.fromEntries(shapeTargets.map(s => [s.name, s.configScale * s.shapeScale])),
    });

    // ── Scene folders (production + dev 공통: 씬 번호 기반) ──

    // 씬 1: 원 (Sphere deform)
    if (sphereShape) {
      const s1Folder = this.gui.addFolder('씬 1');

      if (sphereShape.depthSize) {
        const ds = sphereShape.depthSize;
        s1Folder.add(ds, 'min', 0, 1.0, 0.05).name('Particle Size Min');
        s1Folder.add(ds, 'max', 0, 2.0, 0.05).name('Particle Size Max');
      }

      s1Folder
        .add(sizeParams, 'size', 0.01, 0.15, 0.005)
        .name('Particle Size')
        .onChange((v: number) => { morpher.particleSize = v; });

      if (isDev) {
        s1Folder.add(sphereShape, 'shapeScale', 0.3, 2.0, 0.05).name('Shape Scale');

        const posParams1 = { posX: sphereShape.worldOffset.x, posY: sphereShape.worldOffset.y, posZ: sphereShape.worldOffset.z };
        const sphereIdx = shapeTargets.indexOf(sphereShape);
        s1Folder.add(posParams1, 'posX', -10, 10, 0.1).name('Position X').onChange((v: number) => { morpher.setShapePosition(sphereIdx, v, posParams1.posY, posParams1.posZ); });
        s1Folder.add(posParams1, 'posY', -10, 10, 0.1).name('Position Y').onChange((v: number) => { morpher.setShapePosition(sphereIdx, posParams1.posX, v, posParams1.posZ); });
        s1Folder.add(posParams1, 'posZ', -10, 10, 0.1).name('Position Z').onChange((v: number) => { morpher.setShapePosition(sphereIdx, posParams1.posX, posParams1.posY, v); });
      }

      s1Folder.open();
    }

    // 씬 3~N: Gyro 및 나머지 shape들 (씬 번호 = shapeIndex + 1)
    shapeTargets.forEach((shape, index) => {
      if (shape.name.startsWith('Sphere')) return; // 씬 1-2에서 이미 처리

      const sceneNum = index + 1; // SphereDeform(0),SphereOrbital(1)→skip, Gyro(2)→씬3, Model2(3)→씬4 ...
      const folder = this.gui.addFolder(`씬 ${sceneNum}`);

      // Production + Dev 공통: scale (shapeUpdater shape은 자체 좌표계이므로 제외)
      if (!morpher.hasShapeUpdater(index)) {
        const cs = shape.configScale;
        const scaleProxy = { scale: cs * shape.shapeScale };
        folder.add(scaleProxy, 'scale', 0.1, 2.0, 0.05).name('Scale').onChange((v: number) => {
          shape.shapeScale = v / cs;
        });
      }

      if (isDev) {
        if (shape.depthSize) {
          const ds = shape.depthSize;
          folder.add(ds, 'min', 0, 1.0, 0.05).name('Particle Size Min');
          folder.add(ds, 'max', 0, 2.0, 0.05).name('Particle Size Max');
        }

        const params = {
          posX: shape.worldOffset.x,
          posY: shape.worldOffset.y,
          posZ: shape.worldOffset.z,
          holdScatter: shape.holdScatter,
        };

        folder.add(params, 'posX', -10, 10, 0.1).name('Position X').onChange((v: number) => { morpher.setShapePosition(index, v, params.posY, params.posZ); });
        folder.add(params, 'posY', -10, 10, 0.1).name('Position Y').onChange((v: number) => { morpher.setShapePosition(index, params.posX, v, params.posZ); });
        folder.add(params, 'posZ', -10, 10, 0.1).name('Position Z').onChange((v: number) => { morpher.setShapePosition(index, params.posX, params.posY, v); });

        folder.add(params, 'holdScatter', 0, 0.1, 0.001).name('Hold Scatter').onChange((v: number) => { shape.holdScatter = v; });

        if (shape.autoRotateSpeed !== undefined) {
          folder.add(shape, 'autoRotateSpeed', 0, 1.0, 0.01).name('Auto Rotate Speed');
        }

        if (shape.enterTransition?.gravity) {
          const gravFolder = folder.addFolder('Gravity Fall');
          const et = shape.enterTransition;
          gravFolder.add(et, 'gravityHeight', 1, 20, 0.5).name('Height');
          gravFolder.add(et, 'gravityDuration', 0.5, 10, 0.1).name('Duration (s)');
          gravFolder.add(et, 'gravityWobbleFreq', 0, 12, 0.5).name('Wobble Freq');
          gravFolder.add({ replay: () => { morpher.resetGravitySettle(); } }, 'replay').name('▶ Replay');
        }
      }

      folder.open();
    });

    // ── Dev-only global controls ──

    if (isDev) {
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

      globalFolder
        .add(particleConfig, 'depthFarMul', 0.1, 5.0, 0.1)
        .name('Far Size (×)');

      globalFolder
        .add(globalParams, 'mouseRadius', 0.05, 2.0, 0.01)
        .name('Dome Radius')
        .onChange((v: number) => { particleConfig.mouseRadius = v; });

      globalFolder
        .add(particleConfig, 'activationRadius', 1.0, 10.0, 0.5)
        .name('Activation Radius');

      globalFolder
        .add(particleConfig, 'showDomeDebug')
        .name('Show Dome Area');

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

      globalFolder
        .add(particleConfig, 'parallaxStrength', 0, 0.5, 0.01)
        .name('Parallax');

      // Animation phases
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

      // Transition rotation
      const transFolder = globalFolder.addFolder('Transition Rotation');
      transFolder
        .add(particleConfig, 'transitionRotation')
        .name('Enable');
      transFolder
        .add(particleConfig, 'transitionRotationSpeed', 0.5, 10.0, 0.5)
        .name('Speed');

      // Size effect
      const szFolder = globalFolder.addFolder('Size Effect');
      szFolder
        .add(particleConfig, 'mouseSizeEffect')
        .name('Enable');
      szFolder
        .add(particleConfig, 'mouseSizeStrength', 0, 2.0, 0.05)
        .name('Strength');

      // Orbit & Spring
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

      // Particle count info
      this.gui.add({ particles: morpher.totalParticleCount }, 'particles')
        .name('Total Particles')
        .disable();

      // Live Lighting Monitor
      const liveFolder = this.gui.addFolder('Live Lighting');
      const liveParams = {
        ambient: 0,
        diffuse: 0,
        specular: 0,
        shininess: 0,
      };
      const ambCtrl = liveFolder.add(liveParams, 'ambient', 0, 10, 0.01).name('Ambient').disable();
      const difCtrl = liveFolder.add(liveParams, 'diffuse', 0, 1, 0.01).name('Diffuse').disable();
      const spcCtrl = liveFolder.add(liveParams, 'specular', 0, 2, 0.01).name('Specular').disable();
      const shnCtrl = liveFolder.add(liveParams, 'shininess', 0, 128, 0.1).name('Shininess').disable();
      liveFolder.open();

      const updateLiveMonitor = () => {
        const cur = morpher.getCurrentLighting();
        if (liveParams.ambient !== cur.ambient || liveParams.diffuse !== cur.diffuse ||
            liveParams.specular !== cur.specular || liveParams.shininess !== cur.shininess) {
          liveParams.ambient = cur.ambient;
          liveParams.diffuse = cur.diffuse;
          liveParams.specular = cur.specular;
          liveParams.shininess = cur.shininess;
          ambCtrl.updateDisplay();
          difCtrl.updateDisplay();
          spcCtrl.updateDisplay();
          shnCtrl.updateDisplay();
        }
        this.animFrameId = requestAnimationFrame(updateLiveMonitor);
      };
      updateLiveMonitor();
    }

    // Save / Export (항상 맨 아래)
    const saveBtn = this.gui.add({ save: () => {
      const s = collectSettings();
      saveSettings(s);
      console.log('[DebugPanel] saved:', s);
      saveBtn.name('Saved!');
      setTimeout(() => saveBtn.name('Save'), 1500);
    } }, 'save').name('Save');
    this.gui.add({ export: () => { exportSettings(collectSettings()); } }, 'export').name('Export');
  }

  destroy() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.gui.destroy();
  }
}
