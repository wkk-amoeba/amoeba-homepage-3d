import * as THREE from 'three';
import { createTorusPoints, createScatteredPositions } from '../../utils/shapeGenerators';
import { getCircleTexture } from '../../utils/circleTexture';
import {
  ShapeData,
  torusConfig,
  scrollConfig,
  getAdjustedParticleCount
} from '../../config/sceneConfig';

export class ScatterShape {
  private points: THREE.Points;
  private sectionStart: number;
  private sectionEnd: number;
  private adjustedCount: number;

  private scatteredPositions: Float32Array;
  private torusPositions: Float32Array;

  constructor(scene: THREE.Scene, data: ShapeData, sectionIndex: number) {
    this.sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
    this.sectionEnd = this.sectionStart + scrollConfig.sectionDuration;

    this.adjustedCount = getAdjustedParticleCount(data.pointCount);

    // Generate positions
    this.scatteredPositions = createScatteredPositions(
      this.adjustedCount,
      torusConfig.scatterRange,
      torusConfig.scatterZOffset
    );
    this.torusPositions = createTorusPoints(
      this.adjustedCount,
      torusConfig.mainRadius,
      torusConfig.tubeRadius
    );

    // Create geometry with scattered positions
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.scatteredPositions.slice(), 3));

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: 0xffffff,
      size: 0.04,
      sizeAttenuation: true,
      depthWrite: false,
      opacity: 0,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;

    scene.add(this.points);
  }

  update(delta: number, scrollProgress: number) {
    const previewStart = this.sectionStart - scrollConfig.previewOffset;
    const isActive = scrollProgress >= previewStart && scrollProgress <= this.sectionEnd + 0.02;

    const material = this.points.material as THREE.PointsMaterial;

    if (!isActive) {
      if (material.opacity > 0.01) {
        material.opacity *= 0.9;
      }
      return;
    }

    let targetOpacity = 0;
    let morphProgress = 0;

    // Preview phase
    if (scrollProgress >= previewStart && scrollProgress < this.sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.5;
      morphProgress = 0;
    }

    // Active section
    if (scrollProgress >= this.sectionStart && scrollProgress <= this.sectionEnd) {
      const localProgress = (scrollProgress - this.sectionStart) / (this.sectionEnd - this.sectionStart);

      if (localProgress < 0.3) {
        targetOpacity = Math.min(1, localProgress / 0.3);
        morphProgress = 0;
      } else if (localProgress < 0.9) {
        targetOpacity = 1;
        morphProgress = (localProgress - 0.3) / 0.6;
      } else {
        targetOpacity = Math.max(0, (1 - localProgress) * 10);
        morphProgress = 1;
      }
    }

    // Update particle positions
    const positionAttribute = this.points.geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;

    // easeOutCubic
    const easedProgress = 1 - Math.pow(1 - morphProgress, 3);

    for (let i = 0; i < this.adjustedCount; i++) {
      const i3 = i * 3;

      const scatterX = this.scatteredPositions[i3];
      const scatterY = this.scatteredPositions[i3 + 1];
      const scatterZ = this.scatteredPositions[i3 + 2];

      const torusX = this.torusPositions[i3] * 3 + torusConfig.position[0];
      const torusY = this.torusPositions[i3 + 1] * 3 + torusConfig.position[1];
      const torusZ = this.torusPositions[i3 + 2] * 3 + torusConfig.position[2];

      positions[i3] = THREE.MathUtils.lerp(scatterX, torusX, easedProgress);
      positions[i3 + 1] = THREE.MathUtils.lerp(scatterY, torusY, easedProgress);
      positions[i3 + 2] = THREE.MathUtils.lerp(scatterZ, torusZ, easedProgress);
    }
    positionAttribute.needsUpdate = true;

    // Rotation when formed
    if (morphProgress > 0.5) {
      const rotationFactor = (morphProgress - 0.5) * 2;
      this.points.rotation.x += delta * 0.2 * rotationFactor;
      this.points.rotation.y += delta * 0.15 * rotationFactor;
    }

    // Opacity
    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
