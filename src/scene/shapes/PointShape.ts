import * as THREE from 'three';
import { createShapePoints } from '../../utils/shapeGenerators';
import { getCircleTexture } from '../../utils/circleTexture';
import {
  ShapeData,
  waitPositions,
  scrollConfig,
  getAdjustedParticleCount
} from '../../config/sceneConfig';

export class PointShape {
  private points: THREE.Points;
  private data: ShapeData;
  private sectionStart: number;
  private sectionEnd: number;

  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  constructor(scene: THREE.Scene, data: ShapeData, sectionIndex: number) {
    this.data = data;
    this.sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
    this.sectionEnd = this.sectionStart + scrollConfig.sectionDuration;

    const adjustedCount = getAdjustedParticleCount(data.pointCount);
    const positions = createShapePoints(data.geometry, adjustedCount);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: data.color,
      size: 0.03,
      sizeAttenuation: true,
      depthWrite: false,
      opacity: 0,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;

    // Set initial position
    const waitPos = waitPositions[data.animation] || [0, 0, -20];
    this.points.position.set(...waitPos);
    this.points.scale.setScalar(3);

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

    let targetPosition: [number, number, number] = waitPositions[this.data.animation] || [0, 0, -20];
    let targetScale = 3;
    let targetOpacity = 0;

    // Preview phase
    if (scrollProgress >= previewStart && scrollProgress < this.sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.3;
    }

    // Active section
    if (scrollProgress >= this.sectionStart && scrollProgress <= this.sectionEnd) {
      const localProgress = (scrollProgress - this.sectionStart) / (this.sectionEnd - this.sectionStart);

      switch (this.data.animation) {
        case 'left-to-center': {
          const leftX = -5 + localProgress * 2;
          const leftY = -2 + localProgress * 1.5;
          targetPosition = [leftX, leftY, 2];
          targetScale = 3;
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;
        }
        case 'right-to-center': {
          const rightX = 5 - localProgress * 2;
          const rightY = -2 + localProgress * 1.5;
          targetPosition = [rightX, rightY, 2];
          targetScale = 3;
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;
        }
        case 'zoom-through': {
          const zoomZ = 15 - localProgress * 30;
          targetPosition = [0, 0, zoomZ];
          targetScale = 3;
          targetOpacity = localProgress > 0.7 ? Math.max(0, (1 - localProgress) * 3.3) : 1;
          break;
        }
        case 'curve-zoom': {
          const curveT = localProgress;
          const curveX = 6 - curveT * 8;
          const curveY = -3 + Math.sin(curveT * Math.PI) * 4;
          const curveZ = 2 + curveT * 5;
          targetPosition = [curveX, curveY, curveZ];
          targetScale = 3;
          targetOpacity = curveT > 0.85 ? (1 - curveT) * 6.7 : 1;
          break;
        }
      }
    }

    // Smooth interpolation
    this.tempPosition.set(...targetPosition);
    this.tempScale.setScalar(targetScale);
    this.points.position.lerp(this.tempPosition, 0.06);
    this.points.scale.lerp(this.tempScale, 0.06);

    // Rotation
    this.points.rotation.x += delta * 0.2;
    this.points.rotation.y += delta * 0.15;

    // Opacity
    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
