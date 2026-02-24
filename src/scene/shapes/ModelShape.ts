import * as THREE from 'three';
import { getCircleTexture } from '../../utils/circleTexture';
import { ModelData, waitPositions, scrollConfig, animationPhases, getParticleMultiplier, PERFORMANCE_CONFIG } from '../../config/sceneConfig';

export class ModelShape {
  private scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private data: ModelData;
  private sectionStart: number;
  private sectionEnd: number;
  private loaded = false;

  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  // Debug panel support
  private _totalParticleCount = 0;
  private _visibleParticleCount = 0;
  private _userScale = 1.0;

  constructor(scene: THREE.Scene, data: ModelData, sectionIndex: number) {
    this.scene = scene;
    this.data = data;

    this.sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
    this.sectionEnd = this.sectionStart + scrollConfig.sectionDuration;

    this.loadModel();
  }

  // --- Debug panel accessors ---

  get name(): string {
    return this.data.name;
  }

  get configScale(): number {
    return this.data.scale;
  }

  get totalParticleCount(): number {
    return this._totalParticleCount;
  }

  get visibleParticleCount(): number {
    return this._visibleParticleCount;
  }

  set visibleParticleCount(count: number) {
    const clamped = Math.max(100, Math.min(count, this._totalParticleCount));
    this._visibleParticleCount = clamped;
    if (this.points) {
      this.points.geometry.setDrawRange(0, clamped);
    }
  }

  get userScale(): number {
    return this._userScale;
  }

  set userScale(value: number) {
    this._userScale = value;
  }

  // --- End debug panel accessors ---

  private async loadModel() {
    try {
      // Derive .bin path from .glb path
      const binPath = this.data.modelPath
        .replace('/models/', '/models/vertices/')
        .replace('.glb', '.bin');

      const response = await fetch(binPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${binPath}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const positions = new Float32Array(arrayBuffer);
      this._totalParticleCount = positions.length / 3;

      if (this._totalParticleCount === 0) {
        console.error(`No vertices in pre-extracted file: ${this.data.name}`);
        return;
      }

      // Uniform sub-sampling for lower-end devices (preserves shape across all body parts)
      const multiplier = this.data.particleCount !== undefined
        ? Math.min(this.data.particleCount, this._totalParticleCount) / this._totalParticleCount
        : getParticleMultiplier();

      let sampledPositions: Float32Array;
      if (multiplier < 1.0) {
        const targetCount = Math.floor(this._totalParticleCount * multiplier);
        const step = Math.max(1, Math.ceil(this._totalParticleCount / targetCount));
        const sampled: number[] = [];
        for (let i = 0; i < this._totalParticleCount; i++) {
          if (i % step === 0) {
            const base = i * 3;
            sampled.push(positions[base], positions[base + 1], positions[base + 2]);
          }
        }
        sampledPositions = new Float32Array(sampled);
      } else {
        sampledPositions = positions;
      }
      this._visibleParticleCount = sampledPositions.length / 3;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(sampledPositions, 3));

      // Normalize to 8 units (.bin is centered but not size-normalized)
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        const maxDimension = Math.max(size.x, size.y, size.z);

        const targetSize = 8;
        const normalizeScale = targetSize / maxDimension;
        geometry.scale(normalizeScale, normalizeScale, normalizeScale);

        // Per-model scale
        geometry.scale(this.data.scale, this.data.scale, this.data.scale);

        console.log(`${this.data.name}: original size ${maxDimension.toFixed(2)}, normalized to ${targetSize}, final scale ${this.data.scale}`);
      }

      const material = new THREE.PointsMaterial({
        transparent: true,
        color: 0xffffff,
        size: 0.03,
        sizeAttenuation: true,
        depthWrite: false,
        opacity: 0,
        map: getCircleTexture(),
        alphaMap: getCircleTexture(),
      });

      this.points = new THREE.Points(geometry, material);
      this.points.frustumCulled = PERFORMANCE_CONFIG.enableFrustumCulling;

      // Set initial position
      const waitPos = waitPositions[this.data.animation] || [0, 0, -20];
      this.points.position.set(...waitPos);
      this.points.scale.setScalar(1);

      this.scene.add(this.points);
      this.loaded = true;

      console.log(`Loaded: ${this.data.name} (${this._visibleParticleCount}/${this._totalParticleCount} vertices)`);
    } catch (error) {
      console.error(`Error loading ${this.data.name}:`, error);
    }
  }

  // Easing functions
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  private easeInQuad(t: number): number {
    return t * t;
  }

  private getAnimationPositions(): {
    wait: [number, number, number];
    center: [number, number, number];
    exit: [number, number, number];
  } {
    switch (this.data.animation) {
      case 'left-to-center':
        return {
          wait: [-5, -2, 2],
          center: [0, 0, 2],
          exit: [5, 2, 2],
        };
      case 'right-to-center':
        return {
          wait: [5, -2, 2],
          center: [0, 0, 2],
          exit: [-5, 2, 2],
        };
      case 'zoom-through':
        return {
          wait: [0, 0, 15],
          center: [0, 0, 2],
          exit: [0, 0, -10],
        };
      case 'curve-zoom':
        return {
          wait: [6, -3, 2],
          center: [0, 0, 2],
          exit: [-6, 3, 7],
        };
      case 'scatter-to-form':
        return {
          wait: [3, -2, 5],
          center: [0, 0, 2],
          exit: [-3, 2, -5],
        };
      default:
        return {
          wait: [0, 0, -20],
          center: [0, 0, 2],
          exit: [0, 0, 20],
        };
    }
  }

  update(delta: number, scrollProgress: number) {
    if (!this.loaded || !this.points) return;

    const previewStart = this.sectionStart - scrollConfig.previewOffset;
    const isActive = scrollProgress >= previewStart && scrollProgress <= this.sectionEnd + 0.02;

    const material = this.points.material as THREE.PointsMaterial;

    if (!isActive) {
      if (material.opacity > 0.01) {
        material.opacity *= 0.9;
      }
      return;
    }

    const positions = this.getAnimationPositions();
    let targetPosition: [number, number, number] = positions.wait;
    let targetScale = 1 * this._userScale;
    let targetOpacity = 0;

    const { enterRatio, holdRatio } = animationPhases;

    // Preview phase
    if (scrollProgress >= previewStart && scrollProgress < this.sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.3;
      targetPosition = positions.wait;
    }

    // Active section (3-phase animation)
    if (scrollProgress >= this.sectionStart && scrollProgress <= this.sectionEnd) {
      const localProgress = (scrollProgress - this.sectionStart) / (this.sectionEnd - this.sectionStart);

      if (localProgress < enterRatio) {
        const enterProgress = this.easeOutQuad(localProgress / enterRatio);
        targetPosition = [
          positions.wait[0] + (positions.center[0] - positions.wait[0]) * enterProgress,
          positions.wait[1] + (positions.center[1] - positions.wait[1]) * enterProgress,
          positions.wait[2] + (positions.center[2] - positions.wait[2]) * enterProgress,
        ];
        targetOpacity = enterProgress;
      } else if (localProgress < enterRatio + holdRatio) {
        targetPosition = positions.center;
        targetOpacity = 1;
      } else {
        const exitProgress = this.easeInQuad((localProgress - enterRatio - holdRatio) / (1 - enterRatio - holdRatio));
        targetPosition = [
          positions.center[0] + (positions.exit[0] - positions.center[0]) * exitProgress,
          positions.center[1] + (positions.exit[1] - positions.center[1]) * exitProgress,
          positions.center[2] + (positions.exit[2] - positions.center[2]) * exitProgress,
        ];
        targetOpacity = 1 - exitProgress;
      }
    }

    // Smooth interpolation
    this.tempPosition.set(...targetPosition);
    this.tempScale.setScalar(targetScale);
    this.points.position.lerp(this.tempPosition, 0.08);
    this.points.scale.lerp(this.tempScale, 0.08);

    // Rotation
    this.points.rotation.x += delta * 0.15;
    this.points.rotation.y += delta * 0.1;

    // Opacity
    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }
  }
}
