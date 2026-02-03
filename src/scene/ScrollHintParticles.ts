import * as THREE from 'three';
import { getCircleTexture } from '../utils/circleTexture';
import { scrollConfig } from '../config/sceneConfig';

export class ScrollHintParticles {
  private scene: THREE.Scene;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private particleCount = 80;
  private initialPositions: Float32Array;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 파티클 위치 생성 - 화살표 형태로 아래쪽을 가리킴
    const positions = new Float32Array(this.particleCount * 3);
    this.initialPositions = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      if (i < 50) {
        // 흩어진 배경 파티클
        positions[i3] = (Math.random() - 0.5) * 8;
        positions[i3 + 1] = (Math.random() - 0.5) * 6;
        positions[i3 + 2] = (Math.random() - 0.5) * 4 + 2;
      } else if (i < 65) {
        // 아래쪽 화살표 형태 파티클 (▼ 모양 - 끝이 아래를 가리킴)
        const t = (i - 50) / 15;
        const side = i % 2 === 0 ? 1 : -1;
        positions[i3] = side * (1 - t) * 0.8;  // 위에서 넓고 아래로 갈수록 좁아짐
        positions[i3 + 1] = -1.5 - t * 1.2;    // 아래로 내려감
        positions[i3 + 2] = 3;
      } else {
        // 세로선 파티클 (화살표 줄기)
        const t = (i - 65) / 15;
        positions[i3] = 0;
        positions[i3 + 1] = 0.5 - t * 2;
        positions[i3 + 2] = 3;
      }

      // 초기 위치 저장
      this.initialPositions[i3] = positions[i3];
      this.initialPositions[i3 + 1] = positions[i3 + 1];
      this.initialPositions[i3 + 2] = positions[i3 + 2];
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: 0xffffff,
      size: 0.05,
      sizeAttenuation: true,
      depthWrite: false,
      opacity: 0.8,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    this.points = new THREE.Points(this.geometry, material);
    this.scene.add(this.points);
  }

  update(delta: number, scrollProgress: number) {
    const material = this.points.material as THREE.PointsMaterial;
    const positions = this.geometry.attributes.position.array as Float32Array;

    // 인트로 구간 (0~10%)에서만 표시
    const fadeProgress = Math.min(1, scrollProgress / scrollConfig.introEnd);
    const targetOpacity = 1 - fadeProgress;

    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity * 0.8, 0.1);

    // 화살표 파티클 애니메이션 (위아래로 살짝 움직임)
    const time = Date.now() * 0.002;
    const bounce = Math.sin(time) * 0.1;

    for (let i = 50; i < this.particleCount; i++) {
      const i3 = i * 3;
      positions[i3 + 1] = this.initialPositions[i3 + 1] + bounce;
    }

    // 배경 파티클 천천히 회전
    for (let i = 0; i < 50; i++) {
      const i3 = i * 3;
      const x = this.initialPositions[i3];
      const z = this.initialPositions[i3 + 2];
      const angle = time * 0.1;
      positions[i3] = x * Math.cos(angle) - (z - 2) * Math.sin(angle);
      positions[i3 + 2] = x * Math.sin(angle) + (z - 2) * Math.cos(angle) + 2;
    }

    this.geometry.attributes.position.needsUpdate = true;

    // 스크롤하면 파티클이 흩어지며 사라짐
    if (fadeProgress > 0) {
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        const scatterX = (Math.random() - 0.5) * fadeProgress * 0.5;
        const scatterY = -fadeProgress * 3;
        const scatterZ = -fadeProgress * 5;

        positions[i3] += scatterX * delta;
        positions[i3 + 1] += scatterY * delta;
        positions[i3 + 2] += scatterZ * delta;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.scene.remove(this.points);
  }
}
