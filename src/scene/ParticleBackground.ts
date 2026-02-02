import * as THREE from 'three';
import { createBackgroundParticles } from '../utils/shapeGenerators';
import { getCircleTexture } from '../utils/circleTexture';
import { backgroundConfig, getAdjustedParticleCount } from '../config/sceneConfig';

export class ParticleBackground {
  private points: THREE.Points;

  constructor(scene: THREE.Scene) {
    const count = getAdjustedParticleCount(backgroundConfig.count);
    const positions = createBackgroundParticles(
      count,
      backgroundConfig.spread,
      backgroundConfig.zOffset
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: 0xffffff,
      size: backgroundConfig.size * 2,
      sizeAttenuation: true,
      depthWrite: false,
      opacity: backgroundConfig.opacity,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(delta: number) {
    this.points.rotation.y += backgroundConfig.rotationSpeed * delta;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
