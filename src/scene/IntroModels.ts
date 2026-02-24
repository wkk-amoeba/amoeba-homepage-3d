import * as THREE from 'three';
import { getCircleTexture } from '../utils/circleTexture';
import { introModelsConfig, scrollConfig, scatterDirections, getParticleMultiplier, PERFORMANCE_CONFIG } from '../config/sceneConfig';

interface LoadedModel {
  points: THREE.Points;
  initialPos: [number, number, number];
  loaded: boolean;
}

export class IntroModels {
  private scene: THREE.Scene;
  private models: LoadedModel[] = [];
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loadModels();
  }

  private loadModels() {
    introModelsConfig.forEach((config, index) => {
      const placeholder: LoadedModel = {
        points: new THREE.Points(),
        initialPos: config.initialPos,
        loaded: false,
      };
      this.models.push(placeholder);

      this.loadSingleModel(config, index, placeholder);
    });
  }

  private async loadSingleModel(
    config: typeof introModelsConfig[number],
    index: number,
    placeholder: LoadedModel,
  ) {
    try {
      // Derive .bin path from .glb path
      const binPath = config.modelPath
        .replace('/models/', '/models/vertices/')
        .replace('.glb', '.bin');

      const response = await fetch(binPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${binPath}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const fullPositions = new Float32Array(arrayBuffer);
      const totalVertexCount = fullPositions.length / 3;

      if (totalVertexCount === 0) {
        console.error(`No vertices in pre-extracted intro model: ${index}`);
        return;
      }

      // Device-based sub-sampling
      const multiplier = getParticleMultiplier();
      let positions: Float32Array;

      if (multiplier < 1.0) {
        const targetCount = Math.floor(totalVertexCount * multiplier);
        const step = Math.max(1, Math.ceil(totalVertexCount / targetCount));
        const sampled: number[] = [];
        for (let i = 0; i < totalVertexCount; i++) {
          if (i % step === 0) {
            const base = i * 3;
            sampled.push(fullPositions[base], fullPositions[base + 1], fullPositions[base + 2]);
          }
        }
        positions = new Float32Array(sampled);
      } else {
        positions = fullPositions;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // Apply model scale (.bin is already centered at origin)
      const scale = config.scale * 0.6;
      geometry.scale(scale, scale, scale);

      const material = new THREE.PointsMaterial({
        transparent: true,
        color: 0xffffff,
        size: 0.02,
        sizeAttenuation: true,
        depthWrite: false,
        opacity: 1,
        map: getCircleTexture(),
        alphaMap: getCircleTexture(),
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = PERFORMANCE_CONFIG.enableFrustumCulling;
      points.position.set(...config.initialPos);

      this.scene.add(points);

      placeholder.points = points;
      placeholder.loaded = true;

      console.log(`Intro model loaded: ${index} (${positions.length / 3} vertices from pre-extracted ${totalVertexCount})`);
    } catch (error) {
      console.error(`Error loading intro model ${index}:`, error);
    }
  }

  update(delta: number, scrollProgress: number) {
    const fadeProgress = Math.min(1, scrollProgress / scrollConfig.introEnd);

    this.models.forEach((model, index) => {
      if (!model.loaded) return;

      const dir = scatterDirections[index] || [0, 0, -10];

      const targetX = model.initialPos[0] + dir[0] * fadeProgress;
      const targetY = model.initialPos[1] + dir[1] * fadeProgress;
      const targetZ = model.initialPos[2] + dir[2] * fadeProgress;

      this.tempPosition.set(targetX, targetY, targetZ);
      model.points.position.lerp(this.tempPosition, 0.1);

      const baseScale = introModelsConfig[index].scale * 0.6;
      const targetScaleVal = baseScale * (1 - fadeProgress * 0.8);
      this.tempScale.set(targetScaleVal, targetScaleVal, targetScaleVal);
      model.points.scale.lerp(this.tempScale, 0.1);

      // Opacity
      const targetOpacity = 1 - fadeProgress;
      const material = model.points.material as THREE.PointsMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);

      // Rotation
      model.points.rotation.x += delta * 0.3;
      model.points.rotation.y += delta * 0.2;
    });
  }

  dispose() {
    this.models.forEach((model) => {
      if (model.loaded) {
        model.points.geometry.dispose();
        (model.points.material as THREE.Material).dispose();
        this.scene.remove(model.points);
      }
    });
  }
}
