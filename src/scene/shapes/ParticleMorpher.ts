import * as THREE from 'three';
import { getCircleTexture } from '../../utils/circleTexture';
import { ModelData, scrollConfig, animationPhases, particleConfig, introConfig, getParticleMultiplier, PERFORMANCE_CONFIG } from '../../config/sceneConfig';
import { createShapePoints } from '../../utils/shapeGenerators';

interface ShapeTarget {
  positions: Float32Array;    // 파티클 위치 (원점 기준, 정규화+스케일 적용됨)
  activeCount: number;        // 실제 유효 파티클 수 (이 수를 넘는 파티클은 비활성)
  worldOffset: THREE.Vector3; // 월드 위치 오프셋
  name: string;
  zMin: number;
  zMax: number;
  holdScatter: number;        // hold 상태 scatter 비율 (0=완전 형태, >0=흩어짐)
  heightSize?: { min: number; max: number; mobileMin?: number; yMin: number; yMax: number }; // Y 위치 기반 크기
  radialSize?: { min: number; max: number; maxRadius: number }; // 중심축 거리 기반 크기
  depthSize?: { min: number; max: number; zMin: number; zMax: number }; // Z 깊이 기반 크기
  spinTop?: { tilt: number; spinSpeed: number; precessionSpeed: number; nutationAmp: number; nutationSpeed: number; pivotY: number };
  shapeScale: number;        // 런타임 per-shape 스케일 (디버그 패널용, 기본 1.0)
  autoRotateSpeed?: number; // 모델별 자전 속도 오버라이드
  lighting?: { ambient?: number; diffuse?: number; specular?: number; shininess?: number };
  enterTransition?: { noRotation?: boolean; gravity?: boolean; gravityHeight?: number; gravityDuration?: number; gravityWobbleFreq?: number; scatterScale?: number };
  particleCenters?: Float32Array;    // per-particle 조명 중심 (count * 3, 위성별 개별 중심)
  usePerParticleCenter?: number;     // 0=shapeCenter uniform 사용, 1=particleCenters attribute 사용
}

interface HoldPhase {
  type: 'hold';
  shapeIdx: number;
}

interface TransitionPhase {
  type: 'transition';
  fromIdx: number;
  toIdx: number;
  t: number; // 0 to 1
}

type MorphPhase = HoldPhase | TransitionPhase;

// Reusable context objects (GC 방지: 매 프레임 mutate)
interface PhaseContext {
  effectiveCenter: THREE.Vector3;
  activeHeightSize: ShapeTarget['heightSize'];
  activeRadialSize: ShapeTarget['radialSize'];
  activeDepthSize: ShapeTarget['depthSize'];
  transFromDepthSize: ShapeTarget['depthSize'];
  transToDepthSize: ShapeTarget['depthSize'];
  transFromRadialSize: ShapeTarget['radialSize'];
  transToRadialSize: ShapeTarget['radialSize'];
  transFromHeightSize: ShapeTarget['heightSize'];
  transToHeightSize: ShapeTarget['heightSize'];
  transSizeBlend: number; // 0=fully from, 1=fully to
}

interface MouseContext {
  localMousePos: THREE.Vector3 | null;
  scaledMouseRadius: number;
  mouseRadiusSq: number;
  camDirLocalX: number;
  camDirLocalY: number;
  camDirLocalZ: number;
}

interface SpinTopMatrix {
  shapeIdx: number; // -1 if no spinTop active
  pivotY: number;   // Y offset from center for tilt pivot (negative = bottom)
  m00: number; m01: number; m02: number;
  m10: number; m11: number; m12: number;
  m20: number; m21: number; m22: number;
}

export class ParticleMorpher {
  private scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private shapeTargets: ShapeTarget[] = [];
  private particleCount = 0;

  // Per-particle state
  private currentPositions: Float32Array = new Float32Array(0);
  private scatterOffsets: Float32Array = new Float32Array(0);
  private mouseOffset: Float32Array = new Float32Array(0);
  private mouseVelocity: Float32Array = new Float32Array(0);
  private sizeMultipliers: Float32Array = new Float32Array(0);
  private particleCenters: Float32Array = new Float32Array(0);

  // Parallax rotation
  private parallaxRotX = 0;
  private parallaxRotY = 0;

  // Mouse state
  private orbitTime = 0;
  private mouseActivity = 0;
  private wasMouseNear = false;

  // Auto-rotation accumulator
  private autoRotateAngle = 0;

  // Per-shape spinTop accumulators
  private spinAngles: number[] = [];
  private precessionAngles: number[] = [];

  // Gravity settle state
  private gravitySettleTime = 0;       // 중력 낙하 경과 시간
  private gravityActiveShapeIdx = -1;  // 현재 중력 활성 shape index
  private gravityTriggered = false;    // hold 진입 후 중력 시작 여부

  // Shader uniforms
  private depthNearMulUniform = { value: particleConfig.depthNearMul };
  private depthFarMulUniform = { value: particleConfig.depthFarMul };
  private localZMinUniform = { value: -4.0 };
  private localZMaxUniform = { value: 4.0 };
  private lightDirUniform: { value: THREE.Vector3 };
  private lightAmbientUniform: { value: number };
  private lightDiffuseUniform: { value: number };
  private lightSpecularUniform: { value: number };
  private lightShininessUniform: { value: number };
  private shapeCenterUniform = { value: new THREE.Vector3(0, 0, 0) };
  private usePerParticleCenterUniform = { value: 0.0 }; // 0=shapeCenter uniform, 1=per-particle center attribute
  private introLightBlendUniform = { value: 1.0 }; // 0=flat gray, 1=full computed lighting

  // Per-particle micro-orbit axes (precomputed at load)
  private orbitAxis1: Float32Array = new Float32Array(0);
  private orbitAxis2: Float32Array = new Float32Array(0);

  // Intro animation
  private introElapsed = 0;
  private introComplete = false;
  private introOpacity = 0;
  private introGatherTriggered = false;


  // Per-shape animation updaters (called each frame before position computation)
  private shapeUpdaters: Map<number, (delta: number, scrollProgress: number) => void> = new Map();

  // Per-shape section spans (from ModelData.sectionSpan, default 1)
  private modelSpans: number[] = [];
  // Precomputed cumulative section boundaries [start, end] per shape
  private sectionBounds: { start: number; end: number }[] = [];

  // Ready promise (resolves when all shapes are loaded)
  readonly ready: Promise<void>;

  // Debug
  private _userScale = 1.0;

  // Reusable context objects (GC 방지)
  private _phaseCtx: PhaseContext = {
    effectiveCenter: new THREE.Vector3(),
    activeHeightSize: undefined,
    activeRadialSize: undefined,
    activeDepthSize: undefined,
    transFromDepthSize: undefined,
    transToDepthSize: undefined,
    transFromRadialSize: undefined,
    transToRadialSize: undefined,
    transFromHeightSize: undefined,
    transToHeightSize: undefined,
    transSizeBlend: 0,
  };
  private _mouseCtx: MouseContext = {
    localMousePos: null,
    scaledMouseRadius: 0,
    mouseRadiusSq: 0,
    camDirLocalX: 0,
    camDirLocalY: 0,
    camDirLocalZ: -1,
  };
  private _spinTopMat: SpinTopMatrix = {
    shapeIdx: -1,
    pivotY: 0,
    m00: 1, m01: 0, m02: 0,
    m10: 0, m11: 1, m12: 0,
    m20: 0, m21: 0, m22: 1,
  };
  // Reusable Vector3 for transition center lerp (GC 방지)
  private _transitionCenter = new THREE.Vector3();

  constructor(scene: THREE.Scene, modelConfigs: ModelData[]) {
    this.scene = scene;

    // Normalize light direction
    const ld = particleConfig.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    this.lightDirUniform = { value: new THREE.Vector3(ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen) };

    // Initialize lighting uniforms with first model's overrides to avoid flash
    const firstLighting = modelConfigs[0]?.lighting;
    this.lightAmbientUniform = { value: firstLighting?.ambient ?? particleConfig.lightAmbient };
    this.lightDiffuseUniform = { value: firstLighting?.diffuse ?? particleConfig.lightDiffuse };
    this.lightSpecularUniform = { value: firstLighting?.specular ?? particleConfig.lightSpecular };
    this.lightShininessUniform = { value: firstLighting?.shininess ?? particleConfig.lightShininess };

    this.ready = this.loadShapes(modelConfigs);
  }

  // --- Public API for DebugPanel ---

  get totalParticleCount(): number {
    return this.particleCount;
  }

  resetGravitySettle() {
    this.gravitySettleTime = 0;
    this.gravityTriggered = true;
  }

  get userScale(): number {
    return this._userScale;
  }

  set userScale(v: number) {
    this._userScale = v;
  }

  get particleSize(): number {
    if (!this.points) return particleConfig.size;
    return (this.points.material as THREE.PointsMaterial).size;
  }

  set particleSize(v: number) {
    if (this.points) {
      (this.points.material as THREE.PointsMaterial).size = v;
    }
  }

  getShapeTargets(): ShapeTarget[] {
    return this.shapeTargets;
  }

  setShapePosition(idx: number, x: number, y: number, z: number) {
    if (idx >= 0 && idx < this.shapeTargets.length) {
      this.shapeTargets[idx].worldOffset.set(x, y, z);
    }
  }

  setLightDirection(x: number, y: number, z: number) {
    const len = Math.sqrt(x * x + y * y + z * z);
    this.lightDirUniform.value.set(x / len, y / len, z / len);
  }

  setLightAmbient(v: number) {
    this.lightAmbientUniform.value = v;
  }

  setLightDiffuse(v: number) {
    this.lightDiffuseUniform.value = v;
  }

  setLightSpecular(v: number) {
    this.lightSpecularUniform.value = v;
  }

  setLightShininess(v: number) {
    this.lightShininessUniform.value = v;
  }

  /** 현재 적용 중인 라이팅 uniform 값 (디버그용) */
  getCurrentLighting() {
    return {
      ambient: this.lightAmbientUniform.value,
      diffuse: this.lightDiffuseUniform.value,
      specular: this.lightSpecularUniform.value,
      shininess: this.lightShininessUniform.value,
    };
  }

  /** Register a per-frame updater for a shape (e.g., animated FBX walking) */
  setShapeUpdater(shapeIdx: number, updater: (delta: number, scrollProgress: number) => void) {
    this.shapeUpdaters.set(shapeIdx, updater);
  }

  /** Get precomputed section bounds for a shape index */
  getSectionBounds(shapeIdx: number): { start: number; end: number } | null {
    return this.sectionBounds[shapeIdx] ?? null;
  }

  /** Current effective center in world space (Points.position + shape offset) */
  private _effectiveCenter = new THREE.Vector3(0, 0, 2);

  getEffectiveCenter(): THREE.Vector3 {
    return this._effectiveCenter;
  }

  // --- Shape loading ---

  private async loadShapes(modelConfigs: ModelData[]) {
    const multiplier = getParticleMultiplier();
    const baseCount = PERFORMANCE_CONFIG.maxVerticesPerModel;
    const maxModelCount = Math.max(baseCount, ...modelConfigs.map(m => m.particleCount || 0));
    this.particleCount = Math.floor(maxModelCount * multiplier);

    for (const config of modelConfigs) {
      let positions: Float32Array;
      let activeCount: number; // 실제 유효 파티클 수

      if (config.precomputedPositions) {
        // Use pre-computed positions (e.g., from FBX skinned mesh extraction)
        const raw = config.precomputedPositions;
        const rawCount = raw.length / 3;
        if (rawCount >= this.particleCount) {
          const step = Math.max(1, Math.ceil(rawCount / this.particleCount));
          const sampled: number[] = [];
          for (let i = 0; i < rawCount && sampled.length / 3 < this.particleCount; i++) {
            if (i % step === 0) {
              sampled.push(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]);
            }
          }
          positions = new Float32Array(sampled);
          activeCount = positions.length / 3;
        } else {
          // 실제 데이터만 복사, 초과분은 (0,0,0)으로 채움
          positions = new Float32Array(this.particleCount * 3);
          for (let i = 0; i < rawCount; i++) {
            positions[i * 3] = raw[i * 3];
            positions[i * 3 + 1] = raw[i * 3 + 1];
            positions[i * 3 + 2] = raw[i * 3 + 2];
          }
          // 나머지는 Float32Array 기본값 0으로 이미 채워짐
          activeCount = rawCount;
        }
        console.log(`ParticleMorpher: loaded ${config.name} from precomputed (${rawCount} → ${activeCount} active / ${this.particleCount} pool)`);
      } else if (config.geometry) {
        positions = createShapePoints(config.geometry, this.particleCount);
        activeCount = this.particleCount;
      } else if (config.modelPath) {
        // GLB .bin pipeline
        const binPath = config.modelPath
          .replace('/models/', '/models/vertices/')
          .replace('.glb', '.bin');

        try {
          const response = await fetch(binPath);
          if (!response.ok) throw new Error(`${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const rawPositions = new Float32Array(arrayBuffer);
          const rawCount = rawPositions.length / 3;

          // 모델별 particleCount가 설정된 경우 해당 수만큼, 아니면 디바이스 multiplier 적용
          const targetCount = config.particleCount
            ? Math.floor(config.particleCount * multiplier)
            : Math.floor(Math.min(rawCount, baseCount) * multiplier);

          // Sub-sample or pad to match pool size
          if (rawCount >= targetCount) {
            const step = Math.max(1, Math.ceil(rawCount / targetCount));
            const sampled: number[] = [];
            for (let i = 0; i < rawCount && sampled.length / 3 < targetCount; i++) {
              if (i % step === 0) {
                sampled.push(rawPositions[i * 3], rawPositions[i * 3 + 1], rawPositions[i * 3 + 2]);
              }
            }
            // 풀 크기에 맞추되, 초과분은 0
            positions = new Float32Array(this.particleCount * 3);
            for (let j = 0; j < sampled.length; j++) {
              positions[j] = sampled[j];
            }
            activeCount = sampled.length / 3;
          } else {
            // rawCount < targetCount: 실제 데이터만 복사, 초과분은 0
            positions = new Float32Array(this.particleCount * 3);
            for (let i = 0; i < rawCount; i++) {
              positions[i * 3] = rawPositions[i * 3];
              positions[i * 3 + 1] = rawPositions[i * 3 + 1];
              positions[i * 3 + 2] = rawPositions[i * 3 + 2];
            }
            activeCount = rawCount;
          }
          console.log(`ParticleMorpher: loaded ${config.name} from ${binPath} (${rawCount} raw → ${activeCount} active / ${this.particleCount} pool)`);
        } catch (err) {
          console.error(`ParticleMorpher: failed to load ${binPath}, falling back to sphere`, err);
          positions = createShapePoints('sphere', this.particleCount);
          activeCount = this.particleCount;
        }
      } else {
        positions = createShapePoints('sphere', this.particleCount);
        activeCount = this.particleCount;
      }

      // Ensure positions array is exactly particleCount * 3
      if (positions.length / 3 !== this.particleCount) {
        const adjusted = new Float32Array(this.particleCount * 3);
        adjusted.set(positions.subarray(0, Math.min(positions.length, adjusted.length)));
        positions = adjusted;
        activeCount = Math.min(activeCount, this.particleCount);
      }

      // Normalize to 8 units + apply scale (activeCount만 대상)
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < activeCount; i++) {
        const i3 = i * 3;
        const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
      const maxDimension = Math.max(sizeX, sizeY, sizeZ);
      const targetSize = 8;
      const normalizeScale = targetSize / maxDimension;
      const isMobile = window.innerWidth < 768;
      const finalScale = normalizeScale; // config.scale은 shapeScale로 런타임 적용

      // activeCount 범위만 스케일 적용 (초과분은 이미 0)
      for (let i = 0; i < activeCount * 3; i++) {
        positions[i] *= finalScale;
      }

      // Apply per-model rotation (skip if spinTop handles it dynamically)
      if (config.rotation && !config.spinTop) {
        const euler = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2]);
        const mat = new THREE.Matrix4().makeRotationFromEuler(euler);
        const v = new THREE.Vector3();
        for (let i = 0; i < activeCount; i++) {
          const i3 = i * 3;
          v.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
          v.applyMatrix4(mat);
          positions[i3] = v.x;
          positions[i3 + 1] = v.y;
          positions[i3 + 2] = v.z;
        }
      }

      // Compute Z bounds for depth shader (activeCount만 대상)
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < activeCount; i++) {
        const z = positions[i * 3 + 2];
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }

      // Compute Y bounds (after normalization+rotation) for heightSize
      let heightSizeData: ShapeTarget['heightSize'] = undefined;
      if (config.heightSize) {
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < activeCount; i++) {
          const y = positions[i * 3 + 1];
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
        heightSizeData = { ...config.heightSize, yMin, yMax };
      }

      // Compute radial bounds (XZ distance from center) for radialSize
      let radialSizeData: ShapeTarget['radialSize'] = undefined;
      if (config.radialSize) {
        let maxRadius = 0;
        for (let i = 0; i < activeCount; i++) {
          const i3 = i * 3;
          const x = positions[i3], z = positions[i3 + 2];
          const r = Math.sqrt(x * x + z * z);
          if (r > maxRadius) maxRadius = r;
        }
        radialSizeData = { ...config.radialSize, maxRadius };
      }

      // Compute Z bounds for depthSize
      let depthSizeData: ShapeTarget['depthSize'] = undefined;
      if (config.depthSize) {
        depthSizeData = { ...config.depthSize, zMin, zMax };
      }

      // Store spinTop config (with defaults for optional nutation)
      let spinTopData: ShapeTarget['spinTop'] = undefined;
      if (config.spinTop) {
        spinTopData = {
          tilt: config.spinTop.tilt,
          spinSpeed: config.spinTop.spinSpeed,
          precessionSpeed: config.spinTop.precessionSpeed,
          nutationAmp: config.spinTop.nutationAmp ?? 0,
          nutationSpeed: config.spinTop.nutationSpeed ?? 1,
          pivotY: config.spinTop.pivotY ?? 0,
        };
      }

      const pos = config.position || [0, 0, 0];
      this.shapeTargets.push({
        positions,
        activeCount,
        worldOffset: new THREE.Vector3(pos[0], pos[1], pos[2]),
        name: config.name,
        zMin,
        zMax,
        holdScatter: config.holdScatter || 0,
        heightSize: heightSizeData,
        radialSize: radialSizeData,
        depthSize: depthSizeData,
        spinTop: spinTopData,
        shapeScale: (isMobile && config.mobileScale !== undefined) ? config.mobileScale : config.scale,
        autoRotateSpeed: config.autoRotateSpeed,
        lighting: config.lighting,
        enterTransition: config.enterTransition,
      });
    }

    // Compute per-shape section spans and cumulative bounds
    this.modelSpans = modelConfigs.map(c => c.sectionSpan ?? 1);
    const { sectionStart, sectionGap } = scrollConfig;
    let offset = sectionStart;
    this.sectionBounds = this.modelSpans.map(span => {
      const start = offset;
      const end = offset + span * sectionGap;
      offset = end;
      return { start, end };
    });

    // Initialize per-shape spinTop angle accumulators
    this.spinAngles = this.shapeTargets.map(() => 0);
    this.precessionAngles = this.shapeTargets.map(() => 0);

    // Initialize per-particle arrays
    this.currentPositions = new Float32Array(this.particleCount * 3);
    this.mouseOffset = new Float32Array(this.particleCount * 3);
    this.mouseVelocity = new Float32Array(this.particleCount * 3);
    this.sizeMultipliers = new Float32Array(this.particleCount);
    this.particleCenters = new Float32Array(this.particleCount * 3);
    const firstActiveCount = this.shapeTargets[0].activeCount;
    for (let i = 0; i < this.particleCount; i++) {
      this.sizeMultipliers[i] = i < firstActiveCount ? 1.0 : 0;
    }

    // Pre-compute scatter offsets (random directions, distance 5-15)
    this.scatterOffsets = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const magnitude = 5 + Math.random() * 10;
      this.scatterOffsets[i3] = Math.sin(phi) * Math.cos(theta) * magnitude;
      this.scatterOffsets[i3 + 1] = Math.sin(phi) * Math.sin(theta) * magnitude;
      this.scatterOffsets[i3 + 2] = Math.cos(phi) * magnitude;
    }

    // Precompute per-particle orbit axes from scatterOffsets (normalized)
    this.orbitAxis1 = new Float32Array(this.particleCount * 3);
    this.orbitAxis2 = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const nx = this.scatterOffsets[i3], ny = this.scatterOffsets[i3 + 1], nz = this.scatterOffsets[i3 + 2];
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const ux = nx / nLen, uy = ny / nLen, uz = nz / nLen;
      // First perpendicular via cross with axis-aligned vector
      let px: number, py: number, pz: number;
      if (Math.abs(ux) < 0.9) { px = 0; py = uz; pz = -uy; }
      else                     { px = -uz; py = 0; pz = ux; }
      const pLen = Math.sqrt(px * px + py * py + pz * pz);
      px /= pLen; py /= pLen; pz /= pLen;
      this.orbitAxis1[i3] = px; this.orbitAxis1[i3 + 1] = py; this.orbitAxis1[i3 + 2] = pz;
      // Second perpendicular: cross(u, p)
      this.orbitAxis2[i3]     = uy * pz - uz * py;
      this.orbitAxis2[i3 + 1] = uz * px - ux * pz;
      this.orbitAxis2[i3 + 2] = ux * py - uy * px;
    }

    // Set initial positions: scattered if intro enabled, otherwise first shape
    const first = this.shapeTargets[0];
    if (introConfig.enabled) {
      this.introComplete = false;
      this.introElapsed = 0;
      this.introOpacity = 0;
      this.introLightBlendUniform.value = 0.0; // start with flat gray (0.5)
      // Use scatterOffsets directly (magnitude 5-15) to fill the entire screen
      // 비활성 파티클은 원점에 숨김
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        if (i < firstActiveCount) {
          this.currentPositions[i3] = this.scatterOffsets[i3];
          this.currentPositions[i3 + 1] = this.scatterOffsets[i3 + 1];
          this.currentPositions[i3 + 2] = this.scatterOffsets[i3 + 2];
        }
        // 비활성 파티클은 Float32Array 기본값 0 유지
      }
    } else {
      this.introComplete = true;
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        this.currentPositions[i3] = first.positions[i3] + first.worldOffset.x;
        this.currentPositions[i3 + 1] = first.positions[i3 + 1] + first.worldOffset.y;
        this.currentPositions[i3 + 2] = first.positions[i3 + 2] + first.worldOffset.z;
      }
    }

    // Update depth uniforms from first shape
    this.localZMinUniform.value = first.zMin;
    this.localZMaxUniform.value = first.zMax;
    this.shapeCenterUniform.value.copy(first.worldOffset);

    this.createPoints();

    console.log(`ParticleMorpher: ${this.particleCount} particles, ${this.shapeTargets.length} shapes`);
  }

  private createPoints() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));
    geometry.setAttribute('mouseMul', new THREE.BufferAttribute(this.sizeMultipliers, 1));
    geometry.setAttribute('particleCenter', new THREE.BufferAttribute(this.particleCenters, 3));

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: 0xffffff,
      size: particleConfig.size,
      sizeAttenuation: true,
      depthWrite: false,
      opacity: 1,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    // Shader injection for depth-size, mouse-size, and lighting
    const nearMulRef = this.depthNearMulUniform;
    const farMulRef = this.depthFarMulUniform;
    const zMinRef = this.localZMinUniform;
    const zMaxRef = this.localZMaxUniform;
    const lightDirUniform = this.lightDirUniform;
    const lightAmbientUniform = this.lightAmbientUniform;
    const lightDiffuseUniform = this.lightDiffuseUniform;
    const lightSpecularUniform = this.lightSpecularUniform;
    const lightShininessUniform = this.lightShininessUniform;
    const shapeCenterUniform = this.shapeCenterUniform;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.depthNearMul = nearMulRef;
      shader.uniforms.depthFarMul = farMulRef;
      shader.uniforms.localZMin = zMinRef;
      shader.uniforms.localZMax = zMaxRef;
      shader.uniforms.lightDir = lightDirUniform;
      shader.uniforms.lightAmbient = lightAmbientUniform;
      shader.uniforms.lightDiffuse = lightDiffuseUniform;
      shader.uniforms.lightSpecular = lightSpecularUniform;
      shader.uniforms.lightShininess = lightShininessUniform;
      shader.uniforms.shapeCenter = shapeCenterUniform;
      shader.uniforms.usePerParticleCenter = this.usePerParticleCenterUniform;
      shader.uniforms.introLightBlend = this.introLightBlendUniform;

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float mouseMul;
attribute vec3 particleCenter;
uniform float depthNearMul;
uniform float depthFarMul;
uniform float localZMin;
uniform float localZMax;
uniform vec3 lightDir;
uniform float lightAmbient;
uniform float lightDiffuse;
uniform float lightSpecular;
uniform float lightShininess;
uniform vec3 shapeCenter;
uniform float usePerParticleCenter;
uniform float introLightBlend;
varying float vBrightness;
void main() {`
      );

      shader.vertexShader = shader.vertexShader.replace(
        'if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );',
        `if ( isPerspective ) {
            gl_PointSize *= ( scale / - mvPosition.z );
            float nearZ = (modelViewMatrix * vec4(0.0, 0.0, localZMax, 1.0)).z;
            float farZ = (modelViewMatrix * vec4(0.0, 0.0, localZMin, 1.0)).z;
            float depthT = clamp((mvPosition.z - nearZ) / (farZ - nearZ), 0.0, 1.0);
            gl_PointSize *= mix(depthNearMul, depthFarMul, depthT);
            gl_PointSize *= mouseMul;
            vec3 lightCenter = mix(shapeCenter, particleCenter, usePerParticleCenter);
            vec3 localPos = position - lightCenter;
            vec3 worldNormal = normalize(mat3(modelMatrix) * localPos);
            float diff = max(dot(worldNormal, lightDir), 0.0);
            vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
            vec3 reflectDir = reflect(-lightDir, worldNormal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), lightShininess);
            float computedBrightness = lightAmbient + lightDiffuse * diff + lightSpecular * spec;
            vBrightness = mix(0.5, computedBrightness, introLightBlend);
          }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        'varying float vBrightness;\nvoid main() {'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb *= vBrightness;'
      );
    };

    // Stencil: write 1 where object particles are drawn
    material.stencilWrite = true;
    material.stencilFunc = THREE.AlwaysStencilFunc;
    material.stencilRef = 1;
    material.stencilZPass = THREE.ReplaceStencilOp;

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.position.set(0, 0, 2);

    this.scene.add(this.points);
  }

  // --- Phase calculation ---

  private getPhase(scrollProgress: number): MorphPhase {
    const { enterRatio, holdRatio } = animationPhases;
    const modelCount = this.shapeTargets.length;

    for (let i = 0; i < modelCount; i++) {
      const bounds = this.sectionBounds[i];
      if (!bounds) continue;
      const secStart = bounds.start;
      const secEnd = bounds.end;
      const sectionDuration = secEnd - secStart;

      if (scrollProgress < secStart || scrollProgress > secEnd + 0.02) continue;

      const local = Math.min(1, Math.max(0,
        (scrollProgress - secStart) / sectionDuration
      ));

      // First model: show immediately at scroll=0
      if (i === 0 && local < enterRatio) {
        return { type: 'hold', shapeIdx: 0 };
      }

      if (local < enterRatio && i > 0) {
        // Enter phase = second half of transition from previous shape
        const t = local / enterRatio;
        const eased = this.easeOutQuad(t);
        return { type: 'transition', fromIdx: i - 1, toIdx: i, t: 0.5 + eased * 0.5 };
      }

      if (local < enterRatio + holdRatio) {
        // Hold phase
        return { type: 'hold', shapeIdx: i };
      }

      // Exit phase
      const exitT = (local - enterRatio - holdRatio) / (1 - enterRatio - holdRatio);
      if (i < modelCount - 1) {
        // First half of transition to next shape
        const eased = this.easeInQuad(exitT);
        return { type: 'transition', fromIdx: i, toIdx: i + 1, t: eased * 0.5 };
      } else {
        // Last model: stay in hold (no next shape)
        return { type: 'hold', shapeIdx: i };
      }
    }

    // Fallback: before first or after last
    const sectionStart = this.sectionBounds[0]?.start ?? 0;
    if (scrollProgress <= sectionStart) return { type: 'hold', shapeIdx: 0 };
    return { type: 'hold', shapeIdx: modelCount - 1 };
  }

  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  private easeInQuad(t: number): number {
    return t * t;
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  // =====================================================================
  // update() helper methods — extracted for readability
  // =====================================================================

  /** Auto-rotation (slow continuous Y-axis spin, per-model override) */
  private updateAutoRotation(delta: number, scrollProgress: number) {
    const phase = this.getPhase(scrollProgress);
    let rotSpeed = particleConfig.autoRotateSpeed;
    if (phase.type === 'hold') {
      const shapeSpeed = this.shapeTargets[phase.shapeIdx]?.autoRotateSpeed;
      if (shapeSpeed !== undefined) rotSpeed = shapeSpeed;
    } else if (phase.type === 'transition') {
      const shapeSpeed = this.shapeTargets[phase.toIdx]?.autoRotateSpeed;
      if (shapeSpeed !== undefined) rotSpeed = shapeSpeed;
    }
    if (rotSpeed !== 0) {
      this.autoRotateAngle += rotSpeed * delta;
    }
  }

  /** Per-shape lighting override (smooth lerp) + per-particle center */
  private updateLightingUniforms(scrollProgress: number) {
    const phase = this.getPhase(scrollProgress);
    let targetAmbient = particleConfig.lightAmbient;
    let targetDiffuse = particleConfig.lightDiffuse;
    let targetSpecular = particleConfig.lightSpecular;
    let targetShininess = particleConfig.lightShininess;

    const getLighting = (idx: number) => this.shapeTargets[idx]?.lighting;

    if (phase.type === 'hold') {
      const lt = getLighting(phase.shapeIdx);
      if (lt) {
        if (lt.ambient !== undefined) targetAmbient = lt.ambient;
        if (lt.diffuse !== undefined) targetDiffuse = lt.diffuse;
        if (lt.specular !== undefined) targetSpecular = lt.specular;
        if (lt.shininess !== undefined) targetShininess = lt.shininess;
      }
    } else if (phase.type === 'transition') {
      const fromLt = getLighting(phase.fromIdx);
      const toLt = getLighting(phase.toIdx);
      const fromA = fromLt?.ambient ?? particleConfig.lightAmbient;
      const toA = toLt?.ambient ?? particleConfig.lightAmbient;
      const fromD = fromLt?.diffuse ?? particleConfig.lightDiffuse;
      const toD = toLt?.diffuse ?? particleConfig.lightDiffuse;
      const fromSp = fromLt?.specular ?? particleConfig.lightSpecular;
      const toSp = toLt?.specular ?? particleConfig.lightSpecular;
      const fromSh = fromLt?.shininess ?? particleConfig.lightShininess;
      const toSh = toLt?.shininess ?? particleConfig.lightShininess;
      targetAmbient = fromA + (toA - fromA) * phase.t;
      targetDiffuse = fromD + (toD - fromD) * phase.t;
      targetSpecular = fromSp + (toSp - fromSp) * phase.t;
      targetShininess = fromSh + (toSh - fromSh) * phase.t;
    }

    this.lightAmbientUniform.value = targetAmbient;
    this.lightDiffuseUniform.value = targetDiffuse;
    this.lightSpecularUniform.value = targetSpecular;
    this.lightShininessUniform.value = targetShininess;

    // Per-particle center for dynamic satellite lighting
    const activeShape = phase.type === 'hold'
      ? this.shapeTargets[phase.shapeIdx]
      : this.shapeTargets[phase.toIdx];
    const usePC = activeShape?.usePerParticleCenter ?? 0;
    this.usePerParticleCenterUniform.value = usePC;
    if (usePC > 0 && activeShape?.particleCenters && this.points) {
      const count = activeShape.activeCount;
      this.particleCenters.set(activeShape.particleCenters.subarray(0, count * 3));
    }
  }

  /** Update spinTop angles for all shapes */
  private updateSpinTopAngles(delta: number) {
    for (let si = 0; si < this.shapeTargets.length; si++) {
      const st = this.shapeTargets[si].spinTop;
      if (st) {
        this.spinAngles[si] += st.spinSpeed * delta;
        this.precessionAngles[si] += st.precessionSpeed * delta;
      }
    }
  }

  /** Parallax rotation based on mouse position */
  private updateParallax(mouseNorm?: THREE.Vector2) {
    if (!this.points) return;
    const pStr = particleConfig.parallaxStrength;
    if (mouseNorm) {
      this.parallaxRotX += (-mouseNorm.y * pStr - this.parallaxRotX) * 0.05;
      this.parallaxRotY += (mouseNorm.x * pStr - this.parallaxRotY) * 0.05;
    } else {
      this.parallaxRotX *= 0.95;
      this.parallaxRotY *= 0.95;
    }
    this.points.rotation.set(this.parallaxRotX, this.parallaxRotY, 0);
  }

  /** Intro animation: particles gather to form first shape. Returns true if still animating (caller should return early). */
  private updateIntroAnimation(delta: number): boolean {
    if (!introConfig.enabled || this.introComplete || !this.points) return false;

    this.introElapsed += delta;
    const first = this.shapeTargets[0];

    // Update shader uniforms for first shape
    this.localZMinUniform.value = first.zMin;
    this.localZMaxUniform.value = first.zMax;
    this.shapeCenterUniform.value.copy(first.worldOffset);
    this._effectiveCenter.set(
      this.points.position.x + first.worldOffset.x,
      this.points.position.y + first.worldOffset.y,
      this.points.position.z + first.worldOffset.z
    );

    if (this.introElapsed < introConfig.delay) {
      // Still in delay phase — keep fully scattered, apply micro-orbit only
      const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const mat = this.points.material as THREE.PointsMaterial;
      mat.opacity = 0;
      this.introOpacity = 0;
      const noiseAmp = particleConfig.microNoiseAmp;
      if (noiseAmp > 0) {
        this.orbitTime += delta;
        for (let i = 0; i < first.activeCount; i++) {
          const i3 = i * 3;
          const angle = this.orbitTime * particleConfig.microNoiseSpeed + this.scatterOffsets[i3];
          const cosA = Math.cos(angle), sinA = Math.sin(angle);
          this.currentPositions[i3] = this.scatterOffsets[i3] + (this.orbitAxis1[i3] * cosA + this.orbitAxis2[i3] * sinA) * noiseAmp;
          this.currentPositions[i3 + 1] = this.scatterOffsets[i3 + 1] + (this.orbitAxis1[i3 + 1] * cosA + this.orbitAxis2[i3 + 1] * sinA) * noiseAmp;
          this.currentPositions[i3 + 2] = this.scatterOffsets[i3 + 2] + (this.orbitAxis1[i3 + 2] * cosA + this.orbitAxis2[i3 + 2] * sinA) * noiseAmp;
        }
      }
      posAttr.needsUpdate = true;
      return true;
    }

    // Gathering phase: lerp from scattered positions to first shape
    const gatherElapsed = this.introElapsed - introConfig.delay;
    const t = Math.min(1, gatherElapsed / introConfig.duration);
    const eased = this.easeOutCubic(t);

    // Fade in: opacity rises quickly in the first half of gathering
    const fadeT = Math.min(1, t * 2);
    this.introOpacity = this.easeOutCubic(fadeT);
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = this.introOpacity;

    // scatter = 1 - eased: starts at 1 (fully scattered), ends at 0 (formed)
    const scatter = 1 - eased;

    // Blend lighting and depth sizing: flat gray → computed lighting over intro
    this.introLightBlendUniform.value = eased;
    // Blend depth multipliers: 1.0 (uniform size) → actual values
    this.depthNearMulUniform.value = 1.0 + (particleConfig.depthNearMul - 1.0) * eased;
    this.depthFarMulUniform.value = 1.0 + (particleConfig.depthFarMul - 1.0) * eased;

    this.orbitTime += delta;
    const noiseAmp = particleConfig.microNoiseAmp;

    // Self-rotation: intro spin + autoRotate combined for seamless handoff
    const totalAngle = introConfig.rotationTurns * Math.PI * 2;
    const rotAngle = totalAngle * (1 - eased) + this.autoRotateAngle;
    const cosRot = Math.cos(rotAngle);
    const sinRot = Math.sin(rotAngle);
    const cx = first.worldOffset.x;
    const cz = first.worldOffset.z;

    for (let i = 0; i < first.activeCount; i++) {
      const i3 = i * 3;
      // Lerp: scattered position → target shape position (including holdScatter)
      const hs = first.holdScatter;
      const fss = first.shapeScale;
      const targetX = first.positions[i3] * fss + first.worldOffset.x + (hs > 0 ? this.scatterOffsets[i3] * hs : 0);
      const targetY = first.positions[i3 + 1] * fss + first.worldOffset.y + (hs > 0 ? this.scatterOffsets[i3 + 1] * hs : 0);
      const targetZ = first.positions[i3 + 2] * fss + first.worldOffset.z + (hs > 0 ? this.scatterOffsets[i3 + 2] * hs : 0);
      let bx = this.scatterOffsets[i3] * scatter + targetX * eased;
      let by = this.scatterOffsets[i3 + 1] * scatter + targetY * eased;
      let bz = this.scatterOffsets[i3 + 2] * scatter + targetZ * eased;

      // Apply self-rotation around Y axis (like object spinning)
      if (rotAngle !== 0) {
        const rx = bx - cx;
        const rz = bz - cz;
        bx = cx + rx * cosRot - rz * sinRot;
        bz = cz + rx * sinRot + rz * cosRot;
      }

      // Micro-orbit
      let orbitX = 0, orbitY = 0, orbitZ = 0;
      if (noiseAmp > 0) {
        const angle = this.orbitTime * particleConfig.microNoiseSpeed + this.scatterOffsets[i3];
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        orbitX = (this.orbitAxis1[i3] * cosA + this.orbitAxis2[i3] * sinA) * noiseAmp;
        orbitY = (this.orbitAxis1[i3 + 1] * cosA + this.orbitAxis2[i3 + 1] * sinA) * noiseAmp;
        orbitZ = (this.orbitAxis1[i3 + 2] * cosA + this.orbitAxis2[i3 + 2] * sinA) * noiseAmp;
      }

      this.currentPositions[i3] = bx + orbitX;
      this.currentPositions[i3 + 1] = by + orbitY;
      this.currentPositions[i3 + 2] = bz + orbitZ;

      // Blend depthSize into sizeMultipliers during intro (1.0 → depthMul)
      if (first.depthSize) {
        const z = this.currentPositions[i3 + 2] - first.worldOffset.z;
        const normalizedZ = (z - first.depthSize.zMin) / (first.depthSize.zMax - first.depthSize.zMin || 1);
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        const depthMul = first.depthSize.min + (first.depthSize.max - first.depthSize.min) * clampedZ;
        this.sizeMultipliers[i] = 1.0 + (depthMul - 1.0) * eased;
      }
    }

    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    const sizeAttr = this.points.geometry.getAttribute('mouseMul') as THREE.BufferAttribute;
    sizeAttr.needsUpdate = true;

    if (!this.introGatherTriggered && t >= 0.25) {
      this.introGatherTriggered = true;
      window.dispatchEvent(new Event('intro-gather-threshold'));
    }
    if (t >= 1) {
      this.introComplete = true;
      this.introLightBlendUniform.value = 1.0;
      this.depthNearMulUniform.value = particleConfig.depthNearMul;
      this.depthFarMulUniform.value = particleConfig.depthFarMul;
      (this.points.material as THREE.PointsMaterial).opacity = 1;
      window.dispatchEvent(new Event('intro-complete'));
      console.log('ParticleMorpher: intro animation complete');
    }
    return true;
  }

  /** Compute effective center and depth bounds for shader, populate _phaseCtx */
  private computePhaseContext(phase: MorphPhase): PhaseContext {
    const ctx = this._phaseCtx;
    ctx.activeHeightSize = undefined;
    ctx.activeRadialSize = undefined;
    ctx.activeDepthSize = undefined;
    ctx.transFromDepthSize = undefined;
    ctx.transToDepthSize = undefined;
    ctx.transFromRadialSize = undefined;
    ctx.transToRadialSize = undefined;
    ctx.transFromHeightSize = undefined;
    ctx.transToHeightSize = undefined;
    ctx.transSizeBlend = 0;

    if (phase.type === 'hold') {
      const shape = this.shapeTargets[phase.shapeIdx];
      ctx.effectiveCenter.copy(shape.worldOffset);
      ctx.activeHeightSize = shape.heightSize;
      ctx.activeRadialSize = shape.radialSize;
      ctx.activeDepthSize = shape.depthSize;
      this.localZMinUniform.value = shape.zMin;
      this.localZMaxUniform.value = shape.zMax;
    } else {
      const from = this.shapeTargets[phase.fromIdx];
      const to = this.shapeTargets[phase.toIdx];
      ctx.effectiveCenter.copy(this._transitionCenter.lerpVectors(from.worldOffset, to.worldOffset, phase.t));
      this.localZMinUniform.value = THREE.MathUtils.lerp(from.zMin, to.zMin, phase.t);
      this.localZMaxUniform.value = THREE.MathUtils.lerp(from.zMax, to.zMax, phase.t);
      // Store both from/to size configs for per-particle blending
      ctx.transFromDepthSize = from.depthSize;
      ctx.transToDepthSize = to.depthSize;
      ctx.transFromRadialSize = from.radialSize;
      ctx.transToRadialSize = to.radialSize;
      ctx.transFromHeightSize = from.heightSize;
      ctx.transToHeightSize = to.heightSize;
      ctx.transSizeBlend = phase.t;
    }
    this.shapeCenterUniform.value.copy(ctx.effectiveCenter);
    this._effectiveCenter.set(
      this.points!.position.x + ctx.effectiveCenter.x,
      this.points!.position.y + ctx.effectiveCenter.y,
      this.points!.position.z + ctx.effectiveCenter.z
    );
    return ctx;
  }

  /** Mouse interaction setup: transform to local space, update activity */
  private computeMouseContext(mouseWorldPos: THREE.Vector3 | null, effectiveCenter: THREE.Vector3, mouseSpeed?: number): MouseContext {
    const ctx = this._mouseCtx;
    ctx.localMousePos = null;
    ctx.camDirLocalX = 0;
    ctx.camDirLocalY = 0;
    ctx.camDirLocalZ = -1;

    if (mouseWorldPos && this.points) {
      const objectCenter = this.points.position.clone().add(effectiveCenter);
      const distToCenter = mouseWorldPos.distanceTo(objectCenter);
      if (distToCenter < particleConfig.activationRadius * this._userScale) {
        // Translate only (no rotation) so interaction zone matches the dome disc visual
        const p = this.points.position;
        const invScale = 1 / this._userScale;
        ctx.localMousePos = new THREE.Vector3(
          (mouseWorldPos.x - p.x) * invScale,
          (mouseWorldPos.y - p.y) * invScale,
          (mouseWorldPos.z - p.z) * invScale,
        );
      }
    }

    // Mouse activity tracking
    const isMouseNear = ctx.localMousePos !== null;
    if (isMouseNear && !this.wasMouseNear) {
      this.mouseActivity = 1.0;
    } else {
      const speedNorm = Math.min((mouseSpeed || 0) * 0.3, 1.0);
      if (speedNorm > this.mouseActivity) {
        this.mouseActivity += (speedNorm - this.mouseActivity) * 0.25;
      } else {
        this.mouseActivity += (speedNorm - this.mouseActivity) * 0.02;
      }
    }
    this.wasMouseNear = isMouseNear;

    ctx.scaledMouseRadius = particleConfig.mouseRadius / this._userScale;
    ctx.mouseRadiusSq = ctx.scaledMouseRadius * ctx.scaledMouseRadius;

    // Camera direction in local space (for dome projection)
    if (ctx.localMousePos && this.points) {
      const invQ = this.points.quaternion.clone().invert();
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(invQ);
      ctx.camDirLocalX = camDir.x;
      ctx.camDirLocalY = camDir.y;
      ctx.camDirLocalZ = camDir.z;
    }

    return ctx;
  }

  /** Precompute spinTop rotation matrix for active shape (Ry(precession) * Rz(tilt) * Ry(spin)) */
  private computeSpinTopMatrix(phase: MorphPhase): SpinTopMatrix {
    const m = this._spinTopMat;
    m.shapeIdx = -1;
    m.pivotY = 0;
    m.m00 = 1; m.m01 = 0; m.m02 = 0;
    m.m10 = 0; m.m11 = 1; m.m12 = 0;
    m.m20 = 0; m.m21 = 0; m.m22 = 1;

    if (phase.type === 'hold') {
      const st = this.shapeTargets[phase.shapeIdx].spinTop;
      if (st) {
        m.shapeIdx = phase.shapeIdx;
        m.pivotY = st.pivotY;
        const tilt = st.tilt + (st.nutationAmp > 0 ? Math.sin(this.precessionAngles[phase.shapeIdx] * st.nutationSpeed / st.precessionSpeed) * st.nutationAmp : 0);
        const spinA = this.spinAngles[phase.shapeIdx];
        const precA = this.precessionAngles[phase.shapeIdx];
        const cp = Math.cos(precA), sp = Math.sin(precA);
        const ct = Math.cos(tilt), st2 = Math.sin(tilt);
        const cs = Math.cos(spinA), ss = Math.sin(spinA);
        m.m00 = cp * ct * cs - sp * ss;
        m.m01 = -cp * st2;
        m.m02 = cp * ct * ss + sp * cs;
        m.m10 = st2 * cs;
        m.m11 = ct;
        m.m12 = st2 * ss;
        m.m20 = -sp * ct * cs - cp * ss;
        m.m21 = sp * st2;
        m.m22 = -sp * ct * ss + cp * cs;
      }
    } else if (phase.type === 'transition') {
      const fromSt = this.shapeTargets[phase.fromIdx].spinTop;
      const toSt = this.shapeTargets[phase.toIdx].spinTop;
      // Determine which spinTop config is active and blend direction
      const activeSt = toSt || fromSt;
      if (activeSt) {
        const activeIdx = toSt ? phase.toIdx : phase.fromIdx;
        m.shapeIdx = activeIdx;
        m.pivotY = activeSt.pivotY;
        // toSt: identity → spinTop (blendT = phase.t)
        // fromSt only: spinTop → identity (blendT = 1 - phase.t)
        const blendT = toSt ? phase.t : (1 - phase.t);
        const tilt = (activeSt.tilt + (activeSt.nutationAmp > 0 ? Math.sin(this.precessionAngles[activeIdx] * activeSt.nutationSpeed / activeSt.precessionSpeed) * activeSt.nutationAmp : 0)) * blendT;
        const spinA = this.spinAngles[activeIdx];
        const precA = this.precessionAngles[activeIdx];
        const cp = Math.cos(precA * blendT), sp = Math.sin(precA * blendT);
        const ct = Math.cos(tilt), st2 = Math.sin(tilt);
        const cs = Math.cos(spinA * blendT), ss = Math.sin(spinA * blendT);
        m.m00 = cp * ct * cs - sp * ss;
        m.m01 = -cp * st2;
        m.m02 = cp * ct * ss + sp * cs;
        m.m10 = st2 * cs;
        m.m11 = ct;
        m.m12 = st2 * ss;
        m.m20 = -sp * ct * cs - cp * ss;
        m.m21 = sp * st2;
        m.m22 = -sp * ct * ss + cp * cs;
      }
    }
    return m;
  }

  /** Gravity settle timer update */
  private updateGravityState(delta: number, phase: MorphPhase) {
    if (phase.type === 'hold') {
      const shape = this.shapeTargets[phase.shapeIdx];
      if (shape.enterTransition?.gravity) {
        if (this.gravityActiveShapeIdx !== phase.shapeIdx) {
          // Just entered hold for this gravity shape — start settling
          this.gravityActiveShapeIdx = phase.shapeIdx;
          this.gravitySettleTime = 0;
          this.gravityTriggered = true;
        }
        if (this.gravityTriggered) {
          this.gravitySettleTime += delta;
        }
      } else {
        this.gravityTriggered = false;
        this.gravityActiveShapeIdx = -1;
      }
    } else if (phase.type === 'transition') {
      const to = this.shapeTargets[phase.toIdx];
      if (to.enterTransition?.gravity) {
        // During transition to gravity shape — keep timer reset
        this.gravityActiveShapeIdx = -1;
        this.gravityTriggered = false;
      }
    }
  }

  /** Compute base position for a single particle based on hold/transition phase */
  private computeBasePosition(
    i: number, i3: number, phase: MorphPhase, effectiveCenter: THREE.Vector3,
  ): { x: number; y: number; z: number; isInactive: boolean } {
    if (phase.type === 'hold') {
      const shape = this.shapeTargets[phase.shapeIdx];
      if (i >= shape.activeCount) {
        // 비활성 파티클: 중심에 배치, 나중에 sizeMul=0
        return { x: shape.worldOffset.x, y: shape.worldOffset.y, z: shape.worldOffset.z, isInactive: true };
      }

      const ss = shape.shapeScale;
      let baseX = shape.positions[i3] * ss + shape.worldOffset.x;
      let baseY = shape.positions[i3 + 1] * ss + shape.worldOffset.y;
      let baseZ = shape.positions[i3 + 2] * ss + shape.worldOffset.z;
      // Apply holdScatter: add scatter offset to keep particles partially dispersed
      if (shape.holdScatter > 0) {
        baseX += this.scatterOffsets[i3] * shape.holdScatter;
        baseY += this.scatterOffsets[i3 + 1] * shape.holdScatter;
        baseZ += this.scatterOffsets[i3 + 2] * shape.holdScatter;
      }
      // Gravity settle: particles fall from above into position over time
      if (this.gravityTriggered && this.gravityActiveShapeIdx === phase.shapeIdx) {
        const enterTr = shape.enterTransition!;
        const gravH = enterTr.gravityHeight ?? 8;
        const settleDuration = enterTr.gravityDuration ?? 3.0;
        // Per-particle stagger: scatter offset으로 각 파티클 낙하 시작 시간 다르게
        const stagger = (this.scatterOffsets[i3] * 0.5 + 0.5) * 1.5; // 0~1.5초 지연
        const particleTime = Math.max(0, this.gravitySettleTime - stagger);
        const fallT = Math.min(1, particleTime / settleDuration);
        // easeInQuad: 처음엔 천천히, 점점 가속 (자유낙하 느낌)
        const fallProgress = fallT * fallT;
        const yOffset = gravH * (1 - fallProgress);
        baseY += yOffset;
        // 낙하 중 흔들림 (감쇠 진동): 떨어지면서 XZ로 살짝 흔들리다 착지 시 멈춤
        if (fallT < 1) {
          const wobbleDecay = 1 - fallT; // 착지에 가까울수록 감소
          const wobbleFreq = enterTr.gravityWobbleFreq ?? 4.0;
          const wobbleAmp = 0.3 * wobbleDecay; // 최대 흔들림 반경
          // 파티클마다 다른 위상으로 흔들리도록 scatter offset 활용
          const phase1 = this.scatterOffsets[i3 + 1] * Math.PI * 2;
          const phase2 = this.scatterOffsets[i3 + 2] * Math.PI * 2;
          baseX += Math.sin(particleTime * wobbleFreq + phase1) * wobbleAmp;
          baseZ += Math.cos(particleTime * wobbleFreq + phase2) * wobbleAmp;
        }
      }
      return { x: baseX, y: baseY, z: baseZ, isInactive: false };
    }

    // Transition phase
    const from = this.shapeTargets[phase.fromIdx];
    const to = this.shapeTargets[phase.toIdx];
    const t = this.smoothstep(phase.t);
    const enterTr = to.enterTransition;
    const fromActive = from.activeCount;
    const toActive = to.activeCount;

    if (i >= fromActive && i >= toActive) {
      // 양쪽 모두 비활성
      return { x: effectiveCenter.x, y: effectiveCenter.y, z: effectiveCenter.z, isInactive: true };
    }

    const fhs = from.holdScatter;
    const ths = to.holdScatter;
    const scatterScaleVal = enterTr?.scatterScale ?? particleConfig.scatterScale;

    // from 위치 결정
    const fss = from.shapeScale;
    const tss = to.shapeScale;
    let fX: number, fY: number, fZ: number;
    if (i < fromActive) {
      fX = from.positions[i3] * fss + from.worldOffset.x + (fhs > 0 ? this.scatterOffsets[i3] * fhs : 0);
      fY = from.positions[i3 + 1] * fss + from.worldOffset.y + (fhs > 0 ? this.scatterOffsets[i3 + 1] * fhs : 0);
      fZ = from.positions[i3 + 2] * fss + from.worldOffset.z + (fhs > 0 ? this.scatterOffsets[i3 + 2] * fhs : 0);
    } else {
      // from에 없음 → to 위치에서 scatter 상태로 시작
      fX = to.positions[i3] * tss + to.worldOffset.x + this.scatterOffsets[i3] * scatterScaleVal * 5;
      fY = to.positions[i3 + 1] * tss + to.worldOffset.y + this.scatterOffsets[i3 + 1] * scatterScaleVal * 5;
      fZ = to.positions[i3 + 2] * tss + to.worldOffset.z + this.scatterOffsets[i3 + 2] * scatterScaleVal * 5;
    }

    // to 위치 결정
    let tX: number, tY: number, tZ: number;
    if (i < toActive) {
      tX = to.positions[i3] * tss + to.worldOffset.x + (ths > 0 ? this.scatterOffsets[i3] * ths : 0);
      tY = to.positions[i3 + 1] * tss + to.worldOffset.y + (ths > 0 ? this.scatterOffsets[i3 + 1] * ths : 0);
      tZ = to.positions[i3 + 2] * tss + to.worldOffset.z + (ths > 0 ? this.scatterOffsets[i3 + 2] * ths : 0);
    } else {
      // to에 없음 → from 위치에서 scatter로 퇴장
      tX = from.positions[i3] * fss + from.worldOffset.x + this.scatterOffsets[i3] * scatterScaleVal * 5;
      tY = from.positions[i3 + 1] * fss + from.worldOffset.y + this.scatterOffsets[i3 + 1] * scatterScaleVal * 5;
      tZ = from.positions[i3 + 2] * fss + from.worldOffset.z + this.scatterOffsets[i3 + 2] * scatterScaleVal * 5;
    }

    // Lerp between shapes
    const lerpX = fX + (tX - fX) * t;
    const lerpY = fY + (tY - fY) * t;
    const lerpZ = fZ + (tZ - fZ) * t;

    // Scatter: per-model override or default
    const scatterAmount = Math.sin(phase.t * Math.PI) * scatterScaleVal;

    let baseX = lerpX + this.scatterOffsets[i3] * scatterAmount;
    let baseY = lerpY + this.scatterOffsets[i3 + 1] * scatterAmount;
    let baseZ = lerpZ + this.scatterOffsets[i3 + 2] * scatterAmount;

    // Gravity: during transition, lift particles to gravityHeight (fall happens in hold)
    if (enterTr?.gravity) {
      const gravH = enterTr.gravityHeight ?? 8;
      // 전환 후반(t→1)에서 파티클이 높이 위치하도록
      baseY += gravH * t;
    }

    // Rotation around effective center during transition (skip if noRotation)
    if (particleConfig.transitionRotation && !enterTr?.noRotation) {
      const cx = effectiveCenter.x;
      // Rotate around Y axis (relative to effective center)
      const angle = phase.t * particleConfig.transitionRotationSpeed * Math.PI * 2;
      const rx = baseX - cx;
      const rz = baseZ;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      baseX = cx + rx * cosA - rz * sinA;
      baseZ = rx * sinA + rz * cosA;
    }

    return { x: baseX, y: baseY, z: baseZ, isInactive: false };
  }

  /** Mouse push/attract, orbit, and size effect for a single particle */
  private applyMouseInteraction(
    i3: number, baseX: number, baseY: number, baseZ: number, mouseCtx: MouseContext,
  ): { targetX: number; targetY: number; targetZ: number; hasTarget: boolean; sizeMul: number } {
    let targetX = 0, targetY = 0, targetZ = 0;
    let hasTarget = false;
    let sizeMul = 1.0;

    if (!mouseCtx.localMousePos) return { targetX, targetY, targetZ, hasTarget, sizeMul };

    const dx = baseX - mouseCtx.localMousePos.x;
    const dy = baseY - mouseCtx.localMousePos.y;
    const dz = baseZ - mouseCtx.localMousePos.z;

    const dot = dx * mouseCtx.camDirLocalX + dy * mouseCtx.camDirLocalY + dz * mouseCtx.camDirLocalZ;
    const perpX = dx - dot * mouseCtx.camDirLocalX;
    const perpY = dy - dot * mouseCtx.camDirLocalY;
    const perpZ = dz - dot * mouseCtx.camDirLocalZ;
    const perpDistSq = perpX * perpX + perpY * perpY + perpZ * perpZ;

    if (perpDistSq < mouseCtx.mouseRadiusSq) {
      const perpDist = Math.sqrt(perpDistSq);
      const normalizedDist = perpDist / mouseCtx.scaledMouseRadius;
      const dome = (1 + Math.cos(Math.PI * normalizedDist)) * 0.5;
      const activity = this.mouseActivity;

      if (perpDist > 0.001) {
        const pushFactor = dome * particleConfig.mouseStrength * activity;
        const invDist = 1 / perpDist;
        const dir = particleConfig.mouseAttract ? -1 : 1;
        targetX = dir * (perpX * invDist) * pushFactor * mouseCtx.scaledMouseRadius;
        targetY = dir * (perpY * invDist) * pushFactor * mouseCtx.scaledMouseRadius;
        targetZ = dir * (perpZ * invDist) * pushFactor * mouseCtx.scaledMouseRadius;
      }

      if (!particleConfig.mouseAttract && particleConfig.orbitStrength > 0 && perpDist > 0.001 && activity > 0.01) {
        const tX = mouseCtx.camDirLocalY * perpZ - mouseCtx.camDirLocalZ * perpY;
        const tY = mouseCtx.camDirLocalZ * perpX - mouseCtx.camDirLocalX * perpZ;
        const tZ = mouseCtx.camDirLocalX * perpY - mouseCtx.camDirLocalY * perpX;
        const tLen = Math.sqrt(tX * tX + tY * tY + tZ * tZ);

        if (tLen > 0.001) {
          const invLen = 1 / tLen;
          const orbitPhase = this.scatterOffsets[i3] * 6.283;
          const orbitVal = Math.sin(this.orbitTime * particleConfig.orbitSpeed + orbitPhase)
            * dome * particleConfig.orbitStrength * mouseCtx.scaledMouseRadius * activity;
          targetX += tX * invLen * orbitVal;
          targetY += tY * invLen * orbitVal;
          targetZ += tZ * invLen * orbitVal;
        }
      }

      hasTarget = true;

      if (particleConfig.mouseSizeEffect) {
        const baseBulge = 0.3;
        const sizeFactor = baseBulge + (1.0 - baseBulge) * activity;
        sizeMul = 1.0 + dome * particleConfig.mouseSizeStrength * sizeFactor;
      }
    }

    return { targetX, targetY, targetZ, hasTarget, sizeMul };
  }

  /** Compute size multiplier from height/radial/depth effects (with transition blending) */
  private computeSizeMultiplier(
    baseX: number, baseY: number, baseZ: number,
    effectiveCenter: THREE.Vector3, ctx: PhaseContext,
  ): number {
    let sizeMul = 1.0;

    // Height-based size effect (with transition blending)
    if (ctx.activeHeightSize) {
      const y = baseY - effectiveCenter.y;
      const normalizedY = (y - ctx.activeHeightSize.yMin) / (ctx.activeHeightSize.yMax - ctx.activeHeightSize.yMin || 1);
      const clampedY = Math.max(0, Math.min(1, normalizedY));
      const isMobile = window.innerWidth < 768;
      const minVal = (isMobile && ctx.activeHeightSize.mobileMin !== undefined) ? ctx.activeHeightSize.mobileMin : ctx.activeHeightSize.min;
      const heightMul = minVal + (ctx.activeHeightSize.max - minVal) * clampedY;
      sizeMul *= heightMul;
    } else if (ctx.transFromHeightSize || ctx.transToHeightSize) {
      // Blend from/to heightSize during transition
      let heightBlend = 1.0;
      if (ctx.transFromHeightSize) {
        const y = baseY - effectiveCenter.y;
        const normalizedY = (y - ctx.transFromHeightSize.yMin) / (ctx.transFromHeightSize.yMax - ctx.transFromHeightSize.yMin || 1);
        const clampedY = Math.max(0, Math.min(1, normalizedY));
        const isMobile = window.innerWidth < 768;
        const minVal = (isMobile && ctx.transFromHeightSize.mobileMin !== undefined) ? ctx.transFromHeightSize.mobileMin : ctx.transFromHeightSize.min;
        const fromMul = minVal + (ctx.transFromHeightSize.max - minVal) * clampedY;
        heightBlend *= 1.0 + (fromMul - 1.0) * (1 - ctx.transSizeBlend); // fade out
      }
      if (ctx.transToHeightSize) {
        const y = baseY - effectiveCenter.y;
        const normalizedY = (y - ctx.transToHeightSize.yMin) / (ctx.transToHeightSize.yMax - ctx.transToHeightSize.yMin || 1);
        const clampedY = Math.max(0, Math.min(1, normalizedY));
        const isMobile = window.innerWidth < 768;
        const minVal = (isMobile && ctx.transToHeightSize.mobileMin !== undefined) ? ctx.transToHeightSize.mobileMin : ctx.transToHeightSize.min;
        const toMul = minVal + (ctx.transToHeightSize.max - minVal) * clampedY;
        heightBlend *= 1.0 + (toMul - 1.0) * ctx.transSizeBlend; // fade in
      }
      sizeMul *= heightBlend;
    }

    // Radial distance-based size effect (중심축에 가까울수록 작게, with transition blending)
    if (ctx.activeRadialSize) {
      const rx = baseX - effectiveCenter.x;
      const rz = baseZ - effectiveCenter.z;
      const radialDist = Math.sqrt(rx * rx + rz * rz);
      const normalizedR = Math.min(1, radialDist / (ctx.activeRadialSize.maxRadius || 1));
      const radialMul = ctx.activeRadialSize.min + (ctx.activeRadialSize.max - ctx.activeRadialSize.min) * normalizedR;
      sizeMul *= radialMul;
    } else if (ctx.transFromRadialSize || ctx.transToRadialSize) {
      let radialBlend = 1.0;
      if (ctx.transFromRadialSize) {
        const rx = baseX - effectiveCenter.x;
        const rz = baseZ - effectiveCenter.z;
        const radialDist = Math.sqrt(rx * rx + rz * rz);
        const normalizedR = Math.min(1, radialDist / (ctx.transFromRadialSize.maxRadius || 1));
        const fromMul = ctx.transFromRadialSize.min + (ctx.transFromRadialSize.max - ctx.transFromRadialSize.min) * normalizedR;
        radialBlend *= 1.0 + (fromMul - 1.0) * (1 - ctx.transSizeBlend);
      }
      if (ctx.transToRadialSize) {
        const rx = baseX - effectiveCenter.x;
        const rz = baseZ - effectiveCenter.z;
        const radialDist = Math.sqrt(rx * rx + rz * rz);
        const normalizedR = Math.min(1, radialDist / (ctx.transToRadialSize.maxRadius || 1));
        const toMul = ctx.transToRadialSize.min + (ctx.transToRadialSize.max - ctx.transToRadialSize.min) * normalizedR;
        radialBlend *= 1.0 + (toMul - 1.0) * ctx.transSizeBlend;
      }
      sizeMul *= radialBlend;
    }

    // Depth (Z) based size effect (먼쪽=min, 가까운쪽=max, with transition blending)
    if (ctx.activeDepthSize) {
      const z = baseZ - effectiveCenter.z;
      const normalizedZ = (z - ctx.activeDepthSize.zMin) / (ctx.activeDepthSize.zMax - ctx.activeDepthSize.zMin || 1);
      const clampedZ = Math.max(0, Math.min(1, normalizedZ));
      const depthMul = ctx.activeDepthSize.min + (ctx.activeDepthSize.max - ctx.activeDepthSize.min) * clampedZ;
      sizeMul *= depthMul;
    } else if (ctx.transFromDepthSize || ctx.transToDepthSize) {
      let depthBlend = 1.0;
      if (ctx.transFromDepthSize) {
        const z = baseZ - effectiveCenter.z;
        const normalizedZ = (z - ctx.transFromDepthSize.zMin) / (ctx.transFromDepthSize.zMax - ctx.transFromDepthSize.zMin || 1);
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        const fromMul = ctx.transFromDepthSize.min + (ctx.transFromDepthSize.max - ctx.transFromDepthSize.min) * clampedZ;
        depthBlend *= 1.0 + (fromMul - 1.0) * (1 - ctx.transSizeBlend);
      }
      if (ctx.transToDepthSize) {
        const z = baseZ - effectiveCenter.z;
        const normalizedZ = (z - ctx.transToDepthSize.zMin) / (ctx.transToDepthSize.zMax - ctx.transToDepthSize.zMin || 1);
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        const toMul = ctx.transToDepthSize.min + (ctx.transToDepthSize.max - ctx.transToDepthSize.min) * clampedZ;
        depthBlend *= 1.0 + (toMul - 1.0) * ctx.transSizeBlend;
      }
      sizeMul *= depthBlend;
    }

    return sizeMul;
  }

  /** Mark geometry buffer attributes as needing update */
  private updateGeometryBuffers() {
    if (!this.points) return;
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    const mulAttr = this.points.geometry.getAttribute('mouseMul') as THREE.BufferAttribute;
    if (mulAttr) mulAttr.needsUpdate = true;
    if (this.usePerParticleCenterUniform.value > 0) {
      const centerAttr = this.points.geometry.getAttribute('particleCenter') as THREE.BufferAttribute;
      if (centerAttr) centerAttr.needsUpdate = true;
    }
  }

  // =====================================================================
  // Main update — orchestration of extracted methods
  // =====================================================================

  update(delta: number, scrollProgress: number, mouseWorldPos: THREE.Vector3 | null, mouseNorm?: THREE.Vector2, mouseSpeed?: number) {
    if (!this.points || this.shapeTargets.length === 0) return;

    // Call per-shape animation updaters (e.g., walking FBX)
    for (const [, updater] of this.shapeUpdaters) {
      updater(delta, scrollProgress);
    }

    // Sync depth uniforms
    this.depthNearMulUniform.value = particleConfig.depthNearMul;
    this.depthFarMulUniform.value = particleConfig.depthFarMul;

    // Update scale
    this.points.scale.setScalar(this._userScale);

    this.updateAutoRotation(delta, scrollProgress);
    this.updateLightingUniforms(scrollProgress);
    this.updateSpinTopAngles(delta);
    this.updateParallax(mouseNorm);

    // --- Intro animation: particles gather to form first shape ---
    if (this.updateIntroAnimation(delta)) return;

    // Get current morph phase
    const phase = this.getPhase(scrollProgress);

    // Compute effective center and depth bounds for shader
    const ctx = this.computePhaseContext(phase);
    const effectiveCenter = ctx.effectiveCenter;

    // --- Mouse interaction setup ---
    const mouseCtx = this.computeMouseContext(mouseWorldPos, effectiveCenter, mouseSpeed);

    const useSpring = particleConfig.springEnabled;
    const stiffness = particleConfig.springStiffness;
    const damping = particleConfig.springDamping;
    const clampedDelta = Math.min(delta, 0.033);

    this.orbitTime += delta;

    // Precompute spinTop rotation matrix for active shape
    const stm = this.computeSpinTopMatrix(phase);

    // --- Gravity settle timer update ---
    this.updateGravityState(delta, phase);

    // --- Per-particle position computation (activeCount 기반 최적화) ---
    let loopCount: number;
    if (phase.type === 'hold') {
      loopCount = this.shapeTargets[phase.shapeIdx].activeCount;
    } else {
      const fromAC = this.shapeTargets[phase.fromIdx].activeCount;
      const toAC = this.shapeTargets[phase.toIdx].activeCount;
      loopCount = Math.max(fromAC, toAC);
    }

    for (let i = 0; i < loopCount; i++) {
      const i3 = i * 3;

      // Compute base position based on phase
      const base = this.computeBasePosition(i, i3, phase, effectiveCenter);
      let baseX = base.x, baseY = base.y, baseZ = base.z;

      // 비활성 파티클: 빠르게 sizeMul→0, 위치는 중심
      if (base.isInactive) {
        this.sizeMultipliers[i] += (0 - this.sizeMultipliers[i]) * 0.3;
        this.currentPositions[i3] = baseX;
        this.currentPositions[i3 + 1] = baseY;
        this.currentPositions[i3 + 2] = baseZ;
        continue;
      }

      // SpinTop rotation (팽이: spin + precession + nutation)
      if (stm.shapeIdx >= 0) {
        // Rotate around pivot point (pivotY offsets from center toward bottom)
        const cx = effectiveCenter.x;
        const cy = effectiveCenter.y + stm.pivotY;
        const cz = effectiveCenter.z;
        const lx = baseX - cx;
        const ly = baseY - cy;
        const lz = baseZ - cz;
        baseX = cx + stm.m00 * lx + stm.m01 * ly + stm.m02 * lz;
        baseY = cy + stm.m10 * lx + stm.m11 * ly + stm.m12 * lz;
        baseZ = cz + stm.m20 * lx + stm.m21 * ly + stm.m22 * lz;
      }

      // Auto-rotation around effective center (Y axis)
      if (this.autoRotateAngle !== 0) {
        const arx = baseX - effectiveCenter.x;
        const arz = baseZ - effectiveCenter.z;
        const arCos = Math.cos(this.autoRotateAngle);
        const arSin = Math.sin(this.autoRotateAngle);
        baseX = effectiveCenter.x + arx * arCos - arz * arSin;
        baseZ = effectiveCenter.z + arx * arSin + arz * arCos;
      }

      // --- Mouse interaction ---
      const mouseResult = this.applyMouseInteraction(i3, baseX, baseY, baseZ, mouseCtx);
      let { targetX, targetY, targetZ } = mouseResult;
      const hasTarget = mouseResult.hasTarget;

      let sizeMulTarget = mouseResult.sizeMul;

      // 전환 시 파티클 수 차이에 따른 size fade
      if (phase.type === 'transition') {
        const fromActive = this.shapeTargets[phase.fromIdx].activeCount;
        const toActive = this.shapeTargets[phase.toIdx].activeCount;
        const t = this.smoothstep(phase.t);
        if (i >= fromActive) sizeMulTarget *= t;        // fade in (0→1)
        if (i >= toActive) sizeMulTarget *= (1 - t);    // fade out (1→0)
      }

      // Height/Radial/Depth size effects
      sizeMulTarget *= this.computeSizeMultiplier(baseX, baseY, baseZ, effectiveCenter, ctx);

      // Smooth size multiplier
      const sizeRate = sizeMulTarget > this.sizeMultipliers[i] ? 0.15 : 0.3;
      this.sizeMultipliers[i] += (sizeMulTarget - this.sizeMultipliers[i]) * sizeRate;

      // Apply mouse offset (spring or lerp)
      if (useSpring) {
        const ax = stiffness * (targetX - this.mouseOffset[i3]) - damping * this.mouseVelocity[i3];
        const ay = stiffness * (targetY - this.mouseOffset[i3 + 1]) - damping * this.mouseVelocity[i3 + 1];
        const az = stiffness * (targetZ - this.mouseOffset[i3 + 2]) - damping * this.mouseVelocity[i3 + 2];

        this.mouseVelocity[i3] += ax * clampedDelta;
        this.mouseVelocity[i3 + 1] += ay * clampedDelta;
        this.mouseVelocity[i3 + 2] += az * clampedDelta;

        this.mouseOffset[i3] += this.mouseVelocity[i3] * clampedDelta;
        this.mouseOffset[i3 + 1] += this.mouseVelocity[i3 + 1] * clampedDelta;
        this.mouseOffset[i3 + 2] += this.mouseVelocity[i3 + 2] * clampedDelta;
      } else {
        if (hasTarget) {
          this.mouseOffset[i3] += (targetX - this.mouseOffset[i3]) * 0.15;
          this.mouseOffset[i3 + 1] += (targetY - this.mouseOffset[i3 + 1]) * 0.15;
          this.mouseOffset[i3 + 2] += (targetZ - this.mouseOffset[i3 + 2]) * 0.15;
        } else {
          const returnRate = 0.3;
          this.mouseOffset[i3] *= (1 - returnRate);
          this.mouseOffset[i3 + 1] *= (1 - returnRate);
          this.mouseOffset[i3 + 2] *= (1 - returnRate);
        }
      }

      // Per-particle micro-orbit around base position
      let orbitX = 0, orbitY = 0, orbitZ = 0;
      const noiseAmp = particleConfig.microNoiseAmp;
      if (noiseAmp > 0) {
        const angle = this.orbitTime * particleConfig.microNoiseSpeed + this.scatterOffsets[i3];
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        orbitX = (this.orbitAxis1[i3]     * cosA + this.orbitAxis2[i3]     * sinA) * noiseAmp;
        orbitY = (this.orbitAxis1[i3 + 1] * cosA + this.orbitAxis2[i3 + 1] * sinA) * noiseAmp;
        orbitZ = (this.orbitAxis1[i3 + 2] * cosA + this.orbitAxis2[i3 + 2] * sinA) * noiseAmp;
      }

      this.currentPositions[i3]     = baseX + this.mouseOffset[i3]     + orbitX;
      this.currentPositions[i3 + 1] = baseY + this.mouseOffset[i3 + 1] + orbitY;
      this.currentPositions[i3 + 2] = baseZ + this.mouseOffset[i3 + 2] + orbitZ;
    }

    // 비활성 파티클 (loopCount 이후): sizeMultiplier → 0으로 감쇠
    for (let i = loopCount; i < this.particleCount; i++) {
      this.sizeMultipliers[i] += (0 - this.sizeMultipliers[i]) * 0.3;
    }

    // Update geometry buffers
    this.updateGeometryBuffers();
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }
  }
}
