import * as THREE from 'three';
import { createBackgroundParticles } from '../utils/shapeGenerators';
import { getCircleTexture } from '../utils/circleTexture';
import { backgroundConfig, getAdjustedParticleCount } from '../config/sceneConfig';

export class ParticleBackground {
  private points: THREE.Points;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const count = getAdjustedParticleCount(backgroundConfig.count);
    const positions = createBackgroundParticles(
      count,
      backgroundConfig.radius,
      backgroundConfig.height,
      backgroundConfig.minRadius
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
    this.points.visible = backgroundConfig.enabled;
    scene.add(this.points);
  }

  get visible(): boolean { return this.points.visible; }
  set visible(v: boolean) { this.points.visible = v; }

  /** Rebuild geometry from current backgroundConfig values */
  rebuild() {
    const count = getAdjustedParticleCount(backgroundConfig.count);
    const positions = createBackgroundParticles(
      count,
      backgroundConfig.radius,
      backgroundConfig.height,
      backgroundConfig.minRadius
    );

    this.points.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.points.geometry = geometry;

    const mat = this.points.material as THREE.PointsMaterial;
    mat.size = backgroundConfig.size * 2;
    mat.opacity = backgroundConfig.opacity;
  }

  update(delta: number) {
    this.points.rotation.y += backgroundConfig.rotationSpeed * delta;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
