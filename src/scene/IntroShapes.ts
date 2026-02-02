import * as THREE from 'three';
import { createShapePoints } from '../utils/shapeGenerators';
import { getCircleTexture } from '../utils/circleTexture';
import {
  introShapesConfig,
  scatterDirections,
  scrollConfig,
  getAdjustedParticleCount
} from '../config/sceneConfig';

interface IntroShape {
  points: THREE.Points;
  initialPos: [number, number, number];
  direction: number[];
}

export class IntroShapes {
  private group: THREE.Group;
  private shapes: IntroShape[] = [];
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    introShapesConfig.forEach((config, index) => {
      const count = getAdjustedParticleCount(config.pointCount);
      const positions = createShapePoints(config.geometry, count);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        transparent: true,
        color: config.color,
        size: 0.025,
        sizeAttenuation: true,
        depthWrite: false,
        opacity: 1,
        map: getCircleTexture(),
        alphaMap: getCircleTexture(),
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.position.set(...config.initialPos);
      points.scale.setScalar(0.6);

      this.group.add(points);
      this.shapes.push({
        points,
        initialPos: config.initialPos,
        direction: scatterDirections[index],
      });
    });
  }

  update(delta: number, scrollProgress: number) {
    const fadeProgress = Math.min(1, scrollProgress / scrollConfig.introEnd);

    this.shapes.forEach(shape => {
      const { points, initialPos, direction } = shape;

      // Calculate target position
      const targetX = initialPos[0] + direction[0] * fadeProgress;
      const targetY = initialPos[1] + direction[1] * fadeProgress;
      const targetZ = initialPos[2] + direction[2] * fadeProgress;

      this.tempPosition.set(targetX, targetY, targetZ);
      points.position.lerp(this.tempPosition, 0.1);

      // Scale down as scrolling
      const targetScaleVal = 0.6 * (1 - fadeProgress * 0.8);
      this.tempScale.setScalar(targetScaleVal);
      points.scale.lerp(this.tempScale, 0.1);

      // Fade out
      const material = points.material as THREE.PointsMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, 1 - fadeProgress, 0.1);

      // Rotation
      points.rotation.x += delta * 0.3;
      points.rotation.y += delta * 0.2;
    });
  }

  dispose() {
    this.shapes.forEach(shape => {
      shape.points.geometry.dispose();
      (shape.points.material as THREE.Material).dispose();
    });
  }
}
