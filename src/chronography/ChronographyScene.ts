import * as THREE from 'three';
import { YEAR_DATA, MAX_PARTICLES } from './yearData';

/** 밀집도 분포 파라미터 */
export interface DensityParams {
  concentration: number;  // 0=균일, 1=한쪽에 완전 집중
  poleY: number;          // 밀집 극점 Y (-1=아래, 0=적도, 1=위)
  poleAngle: number;      // 밀집 극점 수평 각도 (도)
}

/**
 * 3D 구체 위에 파티클을 배치
 * - scatter: 표면에서 불규칙하게 벗어남
 * - density: 특정 방향에 더 많이 분포
 */
function createScatteredSphere(
  count: number,
  scatter: number,
  baseRadius: number,
  seed: number[],
  density: DensityParams
): Float32Array {
  const positions = new Float32Array(count * 3);

  // 밀집 극점 방향 벡터 (단위 벡터)
  const poleAngleRad = density.poleAngle * Math.PI / 180;
  const poleDx = Math.sqrt(1 - density.poleY * density.poleY) * Math.cos(poleAngleRad);
  const poleDy = density.poleY;
  const poleDz = Math.sqrt(1 - density.poleY * density.poleY) * Math.sin(poleAngleRad);

  for (let i = 0; i < count; i++) {
    // 기본 Fibonacci sphere 분포
    let phi = Math.acos(1 - 2 * (i + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    let bx = Math.sin(phi) * Math.cos(theta);
    let by = Math.sin(phi) * Math.sin(theta);
    let bz = Math.cos(phi);

    // 밀집도 적용: concentration > 0이면 극점 방향으로 끌어당김
    if (density.concentration > 0) {
      // 현재 점과 극점 사이의 각도
      const dot = bx * poleDx + by * poleDy + bz * poleDz; // -1 ~ 1
      // dot=1이면 극점과 일치, dot=-1이면 반대편
      // concentration만큼 극점 방향으로 보간
      const t = density.concentration;
      bx = bx * (1 - t) + poleDx * t + bx * dot * t * 0.5;
      by = by * (1 - t) + poleDy * t + by * dot * t * 0.5;
      bz = bz * (1 - t) + poleDz * t + bz * dot * t * 0.5;

      // 다시 단위 벡터로 정규화 (구 표면에 유지)
      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      bx /= len;
      by /= len;
      bz /= len;
    }

    const s0 = seed[i * 4];
    const s1 = seed[i * 4 + 1];
    const s2 = seed[i * 4 + 2];
    const s3 = seed[i * 4 + 3];

    const radialOffset = scatter * (0.5 + s0 * 2.5) * baseRadius;
    const tangentOffset = scatter * (s1 - 0.5) * 1.0 * baseRadius;
    const tangentOffset2 = scatter * (s2 - 0.5) * 1.0 * baseRadius;

    let tx = -by, ty = bx, tz = 0;
    const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    const t2x = by * tz - bz * ty;
    const t2y = bz * tx - bx * tz;
    const t2z = bx * ty - by * tx;

    const r = baseRadius + radialOffset * (s3 > 0.5 ? 1 : -0.3);
    positions[i * 3]     = bx * r + tx * tangentOffset + t2x * tangentOffset2;
    positions[i * 3 + 1] = by * r + ty * tangentOffset + t2y * tangentOffset2;
    positions[i * 3 + 2] = bz * r + tz * tangentOffset + t2z * tangentOffset2;
  }

  return positions;
}

function createCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** 외부에서 조절 가능한 파라미터 */
export interface ChronoParams {
  scatter: number;         // 흩어짐 정도 (0~2)
  rotationSpeed: number;   // 회전 속도 (rad/s)
  particleSize: number;    // 파티클 크기
  breathingAmp: number;    // 미세 떨림 진폭
  breathingSpeed: number;  // 미세 떨림 속도
  convergenceSpeed: number; // 목표 위치 수렴 속도
  density: DensityParams;  // 밀집도 분포
}

export class ChronographyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;

  private currentPositions: Float32Array;
  private targetPositions: Float32Array;
  private colors: Float32Array;
  private targetColors: Float32Array;

  private particleSeeds: number[];

  private currentYearIndex = 0;
  private rotationY = 0;
  private clock = new THREE.Clock();
  baseRadius = 1.8;

  // 외부 조절 가능 파라미터
  params: ChronoParams = {
    scatter: 0.08,
    rotationSpeed: 0.06,
    particleSize: 0.045,
    breathingAmp: 0.003,
    breathingSpeed: 1.5,
    convergenceSpeed: 8,
    density: {
      concentration: 0,
      poleY: 0,
      poleAngle: 0,
    },
  };

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);

    this.particleSeeds = [];
    for (let i = 0; i < MAX_PARTICLES * 4; i++) {
      this.particleSeeds.push(Math.random());
    }

    this.currentPositions = new Float32Array(MAX_PARTICLES * 3);
    this.targetPositions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.targetColors = new Float32Array(MAX_PARTICLES * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: this.params.particleSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      alphaMap: createCircleTexture(),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.setYear(0, true);
    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  /** 현재 연도 즉시 재생성 */
  rebuildCurrentYear(): void {
    this.setYear(this.currentYearIndex, true);
  }

  setYear(index: number, immediate = false): void {
    if (index < 0 || index >= YEAR_DATA.length) return;

    this.currentYearIndex = index;
    const yd = YEAR_DATA[index];
    const color = new THREE.Color(yd.color);

    const scatter = yd.scatter;
    const density = yd.density;

    const spherePos = createScatteredSphere(
      yd.particleCount,
      scatter,
      this.baseRadius,
      this.particleSeeds,
      density
    );

    this.targetPositions.fill(0);
    this.targetColors.fill(0);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i < yd.particleCount) {
        this.targetPositions[i * 3]     = spherePos[i * 3];
        this.targetPositions[i * 3 + 1] = spherePos[i * 3 + 1];
        this.targetPositions[i * 3 + 2] = spherePos[i * 3 + 2];

        const hsl = { h: 0, s: 0, l: 0 };
        color.getHSL(hsl);
        const varied = new THREE.Color();
        varied.setHSL(
          (hsl.h + (this.particleSeeds[i * 4] - 0.5) * 0.2 + 1) % 1,
          Math.max(0.1, Math.min(1, hsl.s + (this.particleSeeds[i * 4 + 1] - 0.5) * 0.4)),
          Math.max(0.15, Math.min(0.85, hsl.l + (this.particleSeeds[i * 4 + 2] - 0.5) * 0.4))
        );
        this.targetColors[i * 3]     = varied.r;
        this.targetColors[i * 3 + 1] = varied.g;
        this.targetColors[i * 3 + 2] = varied.b;
      } else {
        this.targetColors[i * 3] = 0;
        this.targetColors[i * 3 + 1] = 0;
        this.targetColors[i * 3 + 2] = 0;
      }
    }

    if (immediate) {
      this.currentPositions.set(this.targetPositions);
      this.colors.set(this.targetColors);
      this.updateBuffers();
    }
    // immediate가 아니면 animate에서 자연스럽게 수렴
  }

  private updateBuffers(): void {
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, MAX_PARTICLES);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    // Update material size if changed
    this.material.size = this.params.particleSize;

    const convSpeed = this.params.convergenceSpeed;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const i3 = i * 3;

      // Converge toward target
      this.currentPositions[i3]     = THREE.MathUtils.lerp(this.currentPositions[i3], this.targetPositions[i3], delta * convSpeed);
      this.currentPositions[i3 + 1] = THREE.MathUtils.lerp(this.currentPositions[i3 + 1], this.targetPositions[i3 + 1], delta * convSpeed);
      this.currentPositions[i3 + 2] = THREE.MathUtils.lerp(this.currentPositions[i3 + 2], this.targetPositions[i3 + 2], delta * convSpeed);

      // Micro organic drift
      const seed = this.particleSeeds[i * 4];
      const amp = this.params.breathingAmp;
      const spd = this.params.breathingSpeed;
      this.currentPositions[i3]     += Math.sin(time * spd + seed * 20) * amp;
      this.currentPositions[i3 + 1] += Math.cos(time * spd * 0.8 + seed * 15) * amp;
      this.currentPositions[i3 + 2] += Math.sin(time * spd * 1.2 + seed * 25) * amp;

      // Color convergence
      this.colors[i3]     = THREE.MathUtils.lerp(this.colors[i3], this.targetColors[i3], delta * convSpeed);
      this.colors[i3 + 1] = THREE.MathUtils.lerp(this.colors[i3 + 1], this.targetColors[i3 + 1], delta * convSpeed);
      this.colors[i3 + 2] = THREE.MathUtils.lerp(this.colors[i3 + 2], this.targetColors[i3 + 2], delta * convSpeed);
    }

    // Rotation
    this.rotationY += delta * this.params.rotationSpeed;
    this.points.rotation.y = this.rotationY;
    this.points.rotation.x = Math.sin(this.rotationY * 0.3) * 0.08;
    this.points.rotation.z = Math.cos(this.rotationY * 0.2) * 0.04;

    this.updateBuffers();
    this.renderer.render(this.scene, this.camera);
  };

  getCurrentYearIndex(): number {
    return this.currentYearIndex;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
