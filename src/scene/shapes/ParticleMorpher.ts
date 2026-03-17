import * as THREE from 'three';
import { getCircleTexture } from '../../utils/circleTexture';
import { ModelData, scrollConfig, animationPhases, particleConfig, introConfig, getParticleMultiplier, PERFORMANCE_CONFIG } from '../../config/sceneConfig';
import { createShapePoints } from '../../utils/shapeGenerators';

interface ShapeTarget {
  positions: Float32Array;    // 파티클 위치 (원점 기준, 정규화+스케일 적용됨)
  worldOffset: THREE.Vector3; // 월드 위치 오프셋
  name: string;
  zMin: number;
  zMax: number;
  holdScatter: number;        // hold 상태 scatter 비율 (0=완전 형태, >0=흩어짐)
  heightSize?: { min: number; max: number; yMin: number; yMax: number }; // Y 위치 기반 크기
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

  // Parallax rotation
  private parallaxRotX = 0;
  private parallaxRotY = 0;

  // Mouse state
  private orbitTime = 0;
  private mouseActivity = 0;
  private wasMouseNear = false;

  // Auto-rotation accumulator
  private autoRotateAngle = 0;

  // Shader uniforms
  private depthNearMulUniform = { value: particleConfig.depthNearMul };
  private depthFarMulUniform = { value: particleConfig.depthFarMul };
  private localZMinUniform = { value: -4.0 };
  private localZMaxUniform = { value: 4.0 };
  private lightDirUniform: { value: THREE.Vector3 };
  private lightAmbientUniform = { value: particleConfig.lightAmbient };
  private lightDiffuseUniform = { value: particleConfig.lightDiffuse };
  private shapeCenterUniform = { value: new THREE.Vector3(0, 0, 0) };

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

  constructor(scene: THREE.Scene, modelConfigs: ModelData[]) {
    this.scene = scene;

    // Normalize light direction
    const ld = particleConfig.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    this.lightDirUniform = { value: new THREE.Vector3(ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen) };

    this.ready = this.loadShapes(modelConfigs);
  }

  // --- Public API for DebugPanel ---

  get totalParticleCount(): number {
    return this.particleCount;
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
        } else {
          positions = new Float32Array(this.particleCount * 3);
          for (let i = 0; i < this.particleCount; i++) {
            const src = (i % rawCount) * 3;
            positions[i * 3] = raw[src];
            positions[i * 3 + 1] = raw[src + 1];
            positions[i * 3 + 2] = raw[src + 2];
          }
        }
        console.log(`ParticleMorpher: loaded ${config.name} from precomputed (${rawCount} → ${positions.length / 3} pts)`);
      } else if (config.geometry) {
        positions = createShapePoints(config.geometry, this.particleCount);
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

          // Sub-sample or pad to match particleCount
          if (rawCount >= this.particleCount) {
            const step = Math.max(1, Math.ceil(rawCount / this.particleCount));
            const sampled: number[] = [];
            for (let i = 0; i < rawCount && sampled.length / 3 < this.particleCount; i++) {
              if (i % step === 0) {
                sampled.push(rawPositions[i * 3], rawPositions[i * 3 + 1], rawPositions[i * 3 + 2]);
              }
            }
            positions = new Float32Array(sampled);
          } else {
            // Repeat points to fill particleCount
            positions = new Float32Array(this.particleCount * 3);
            for (let i = 0; i < this.particleCount; i++) {
              const src = (i % rawCount) * 3;
              positions[i * 3] = rawPositions[src];
              positions[i * 3 + 1] = rawPositions[src + 1];
              positions[i * 3 + 2] = rawPositions[src + 2];
            }
          }
          console.log(`ParticleMorpher: loaded ${config.name} from ${binPath} (${rawCount} → ${positions.length / 3} pts)`);
        } catch (err) {
          console.error(`ParticleMorpher: failed to load ${binPath}, falling back to sphere`, err);
          positions = createShapePoints('sphere', this.particleCount);
        }
      } else {
        positions = createShapePoints('sphere', this.particleCount);
      }

      // Ensure positions array is exactly particleCount * 3
      if (positions.length / 3 !== this.particleCount) {
        const adjusted = new Float32Array(this.particleCount * 3);
        adjusted.set(positions.subarray(0, Math.min(positions.length, adjusted.length)));
        positions = adjusted;
      }

      // Normalize to 8 units + apply scale
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < this.particleCount; i++) {
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
      const finalScale = normalizeScale * config.scale;

      for (let i = 0; i < positions.length; i++) {
        positions[i] *= finalScale;
      }

      // Apply per-model rotation (e.g., tilting a gyro)
      if (config.rotation) {
        const euler = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2]);
        const mat = new THREE.Matrix4().makeRotationFromEuler(euler);
        const v = new THREE.Vector3();
        for (let i = 0; i < this.particleCount; i++) {
          const i3 = i * 3;
          v.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
          v.applyMatrix4(mat);
          positions[i3] = v.x;
          positions[i3 + 1] = v.y;
          positions[i3 + 2] = v.z;
        }
      }

      // Compute Z bounds for depth shader
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < this.particleCount; i++) {
        const z = positions[i * 3 + 2];
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }

      // Compute Y bounds (after normalization+rotation) for heightSize
      let heightSizeData: ShapeTarget['heightSize'] = undefined;
      if (config.heightSize) {
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < this.particleCount; i++) {
          const y = positions[i * 3 + 1];
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
        heightSizeData = { ...config.heightSize, yMin, yMax };
      }

      const pos = config.position || [0, 0, 0];
      this.shapeTargets.push({
        positions,
        worldOffset: new THREE.Vector3(pos[0], pos[1], pos[2]),
        name: config.name,
        zMin,
        zMax,
        holdScatter: config.holdScatter || 0,
        heightSize: heightSizeData,
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

    // Initialize per-particle arrays
    this.currentPositions = new Float32Array(this.particleCount * 3);
    this.mouseOffset = new Float32Array(this.particleCount * 3);
    this.mouseVelocity = new Float32Array(this.particleCount * 3);
    this.sizeMultipliers = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) this.sizeMultipliers[i] = 1.0;

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
      // Use scatterOffsets directly (magnitude 5-15) to fill the entire screen
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        this.currentPositions[i3] = this.scatterOffsets[i3];
        this.currentPositions[i3 + 1] = this.scatterOffsets[i3 + 1];
        this.currentPositions[i3 + 2] = this.scatterOffsets[i3 + 2];
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
    const shapeCenterUniform = this.shapeCenterUniform;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.depthNearMul = nearMulRef;
      shader.uniforms.depthFarMul = farMulRef;
      shader.uniforms.localZMin = zMinRef;
      shader.uniforms.localZMax = zMaxRef;
      shader.uniforms.lightDir = lightDirUniform;
      shader.uniforms.lightAmbient = lightAmbientUniform;
      shader.uniforms.lightDiffuse = lightDiffuseUniform;
      shader.uniforms.shapeCenter = shapeCenterUniform;

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float mouseMul;
uniform float depthNearMul;
uniform float depthFarMul;
uniform float localZMin;
uniform float localZMax;
uniform vec3 lightDir;
uniform float lightAmbient;
uniform float lightDiffuse;
uniform vec3 shapeCenter;
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
            vec3 localPos = position - shapeCenter;
            vec3 worldNormal = normalize(mat3(modelMatrix) * localPos);
            float diff = max(dot(worldNormal, lightDir), 0.0);
            vBrightness = lightAmbient + lightDiffuse * diff;
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

  // --- Main update ---

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

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

    // Auto-rotation (slow continuous Y-axis spin)
    if (particleConfig.autoRotateSpeed !== 0) {
      this.autoRotateAngle += particleConfig.autoRotateSpeed * delta;
    }

    // Parallax rotation
    const pStr = particleConfig.parallaxStrength;
    if (mouseNorm) {
      this.parallaxRotX += (-mouseNorm.y * pStr - this.parallaxRotX) * 0.05;
      this.parallaxRotY += (mouseNorm.x * pStr - this.parallaxRotY) * 0.05;
    } else {
      this.parallaxRotX *= 0.95;
      this.parallaxRotY *= 0.95;
    }
    this.points.rotation.set(this.parallaxRotX, this.parallaxRotY, 0);

    // --- Intro animation: particles gather to form first shape ---
    if (introConfig.enabled && !this.introComplete) {
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
          for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            const angle = this.orbitTime * particleConfig.microNoiseSpeed + this.scatterOffsets[i3];
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            this.currentPositions[i3] = this.scatterOffsets[i3] + (this.orbitAxis1[i3] * cosA + this.orbitAxis2[i3] * sinA) * noiseAmp;
            this.currentPositions[i3 + 1] = this.scatterOffsets[i3 + 1] + (this.orbitAxis1[i3 + 1] * cosA + this.orbitAxis2[i3 + 1] * sinA) * noiseAmp;
            this.currentPositions[i3 + 2] = this.scatterOffsets[i3 + 2] + (this.orbitAxis1[i3 + 2] * cosA + this.orbitAxis2[i3 + 2] * sinA) * noiseAmp;
          }
        }
        posAttr.needsUpdate = true;
        return;
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

      this.orbitTime += delta;
      const noiseAmp = particleConfig.microNoiseAmp;

      // Self-rotation: intro spin + autoRotate combined for seamless handoff
      const totalAngle = introConfig.rotationTurns * Math.PI * 2;
      const rotAngle = totalAngle * (1 - eased) + this.autoRotateAngle;
      const cosRot = Math.cos(rotAngle);
      const sinRot = Math.sin(rotAngle);
      const cx = first.worldOffset.x;
      const cz = first.worldOffset.z;

      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        // Lerp: scattered position → target shape position (including holdScatter)
        const hs = first.holdScatter;
        const targetX = first.positions[i3] + first.worldOffset.x + (hs > 0 ? this.scatterOffsets[i3] * hs : 0);
        const targetY = first.positions[i3 + 1] + first.worldOffset.y + (hs > 0 ? this.scatterOffsets[i3 + 1] * hs : 0);
        const targetZ = first.positions[i3 + 2] + first.worldOffset.z + (hs > 0 ? this.scatterOffsets[i3 + 2] * hs : 0);
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
      }

      const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;

      if (!this.introGatherTriggered && t >= 0.25) {
        this.introGatherTriggered = true;
        window.dispatchEvent(new Event('intro-gather-threshold'));
      }
      if (t >= 1) {
        this.introComplete = true;
        (this.points.material as THREE.PointsMaterial).opacity = 1;
        window.dispatchEvent(new Event('intro-complete'));
        console.log('ParticleMorpher: intro animation complete');
      }
      return;
    }

    // Get current morph phase
    const phase = this.getPhase(scrollProgress);

    // Compute effective center and depth bounds for shader
    let effectiveCenter: THREE.Vector3;
    let activeHeightSize: ShapeTarget['heightSize'] = undefined;
    if (phase.type === 'hold') {
      const shape = this.shapeTargets[phase.shapeIdx];
      effectiveCenter = shape.worldOffset;
      activeHeightSize = shape.heightSize;
      this.localZMinUniform.value = shape.zMin;
      this.localZMaxUniform.value = shape.zMax;
    } else {
      const from = this.shapeTargets[phase.fromIdx];
      const to = this.shapeTargets[phase.toIdx];
      effectiveCenter = new THREE.Vector3().lerpVectors(from.worldOffset, to.worldOffset, phase.t);
      this.localZMinUniform.value = THREE.MathUtils.lerp(from.zMin, to.zMin, phase.t);
      this.localZMaxUniform.value = THREE.MathUtils.lerp(from.zMax, to.zMax, phase.t);
    }
    this.shapeCenterUniform.value.copy(effectiveCenter);
    this._effectiveCenter.set(
      this.points.position.x + effectiveCenter.x,
      this.points.position.y + effectiveCenter.y,
      this.points.position.z + effectiveCenter.z
    );

    // --- Mouse interaction setup ---
    let localMousePos: THREE.Vector3 | null = null;
    if (mouseWorldPos) {
      const objectCenter = this.points.position.clone().add(effectiveCenter);
      const distToCenter = mouseWorldPos.distanceTo(objectCenter);
      if (distToCenter < particleConfig.activationRadius * this._userScale) {
        // Translate only (no rotation) so interaction zone matches the dome disc visual
        const p = this.points.position;
        const invScale = 1 / this._userScale;
        localMousePos = new THREE.Vector3(
          (mouseWorldPos.x - p.x) * invScale,
          (mouseWorldPos.y - p.y) * invScale,
          (mouseWorldPos.z - p.z) * invScale,
        );
      }
    }

    // Mouse activity tracking
    const isMouseNear = localMousePos !== null;
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

    const scaledMouseRadius = particleConfig.mouseRadius / this._userScale;
    const mouseRadiusSq = scaledMouseRadius * scaledMouseRadius;
    const useSpring = particleConfig.springEnabled;
    const stiffness = particleConfig.springStiffness;
    const damping = particleConfig.springDamping;
    const clampedDelta = Math.min(delta, 0.033);

    // Camera direction in local space (for dome projection)
    let camDirLocalX = 0, camDirLocalY = 0, camDirLocalZ = -1;
    if (localMousePos) {
      const invQ = this.points.quaternion.clone().invert();
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(invQ);
      camDirLocalX = camDir.x;
      camDirLocalY = camDir.y;
      camDirLocalZ = camDir.z;
    }

    this.orbitTime += delta;

    // --- Per-particle position computation ---
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Compute base position based on phase
      let baseX: number, baseY: number, baseZ: number;

      if (phase.type === 'hold') {
        const shape = this.shapeTargets[phase.shapeIdx];
        baseX = shape.positions[i3] + shape.worldOffset.x;
        baseY = shape.positions[i3 + 1] + shape.worldOffset.y;
        baseZ = shape.positions[i3 + 2] + shape.worldOffset.z;
        // Apply holdScatter: add scatter offset to keep particles partially dispersed
        if (shape.holdScatter > 0) {
          baseX += this.scatterOffsets[i3] * shape.holdScatter;
          baseY += this.scatterOffsets[i3 + 1] * shape.holdScatter;
          baseZ += this.scatterOffsets[i3 + 2] * shape.holdScatter;
        }
      } else {
        const from = this.shapeTargets[phase.fromIdx];
        const to = this.shapeTargets[phase.toIdx];
        const t = this.smoothstep(phase.t);

        const fhs = from.holdScatter;
        const ths = to.holdScatter;
        const fromX = from.positions[i3] + from.worldOffset.x + (fhs > 0 ? this.scatterOffsets[i3] * fhs : 0);
        const fromY = from.positions[i3 + 1] + from.worldOffset.y + (fhs > 0 ? this.scatterOffsets[i3 + 1] * fhs : 0);
        const fromZ = from.positions[i3 + 2] + from.worldOffset.z + (fhs > 0 ? this.scatterOffsets[i3 + 2] * fhs : 0);
        const toX = to.positions[i3] + to.worldOffset.x + (ths > 0 ? this.scatterOffsets[i3] * ths : 0);
        const toY = to.positions[i3 + 1] + to.worldOffset.y + (ths > 0 ? this.scatterOffsets[i3 + 1] * ths : 0);
        const toZ = to.positions[i3 + 2] + to.worldOffset.z + (ths > 0 ? this.scatterOffsets[i3 + 2] * ths : 0);

        // Lerp between shapes
        const lerpX = fromX + (toX - fromX) * t;
        const lerpY = fromY + (toY - fromY) * t;
        const lerpZ = fromZ + (toZ - fromZ) * t;

        // Scatter peaks at midpoint of transition
        const scatterAmount = Math.sin(phase.t * Math.PI) * particleConfig.scatterScale;

        baseX = lerpX + this.scatterOffsets[i3] * scatterAmount;
        baseY = lerpY + this.scatterOffsets[i3 + 1] * scatterAmount;
        baseZ = lerpZ + this.scatterOffsets[i3 + 2] * scatterAmount;

        // Rotation around effective center during transition
        if (particleConfig.transitionRotation) {
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

      // --- Mouse interaction (same logic as ModelShape) ---
      let targetX = 0, targetY = 0, targetZ = 0;
      let hasTarget = false;
      let sizeMulTarget = 1.0;

      if (localMousePos) {
        const dx = baseX - localMousePos.x;
        const dy = baseY - localMousePos.y;
        const dz = baseZ - localMousePos.z;

        const dot = dx * camDirLocalX + dy * camDirLocalY + dz * camDirLocalZ;
        const perpX = dx - dot * camDirLocalX;
        const perpY = dy - dot * camDirLocalY;
        const perpZ = dz - dot * camDirLocalZ;
        const perpDistSq = perpX * perpX + perpY * perpY + perpZ * perpZ;

        if (perpDistSq < mouseRadiusSq) {
          const perpDist = Math.sqrt(perpDistSq);
          const normalizedDist = perpDist / scaledMouseRadius;
          const dome = (1 + Math.cos(Math.PI * normalizedDist)) * 0.5;
          const activity = this.mouseActivity;

          if (perpDist > 0.001) {
            const pushFactor = dome * particleConfig.mouseStrength * activity;
            const invDist = 1 / perpDist;
            const dir = particleConfig.mouseAttract ? -1 : 1;
            targetX = dir * (perpX * invDist) * pushFactor * scaledMouseRadius;
            targetY = dir * (perpY * invDist) * pushFactor * scaledMouseRadius;
            targetZ = dir * (perpZ * invDist) * pushFactor * scaledMouseRadius;
          }

          if (!particleConfig.mouseAttract && particleConfig.orbitStrength > 0 && perpDist > 0.001 && activity > 0.01) {
            const tX = camDirLocalY * perpZ - camDirLocalZ * perpY;
            const tY = camDirLocalZ * perpX - camDirLocalX * perpZ;
            const tZ = camDirLocalX * perpY - camDirLocalY * perpX;
            const tLen = Math.sqrt(tX * tX + tY * tY + tZ * tZ);

            if (tLen > 0.001) {
              const invLen = 1 / tLen;
              const orbitPhase = this.scatterOffsets[i3] * 6.283;
              const orbitVal = Math.sin(this.orbitTime * particleConfig.orbitSpeed + orbitPhase)
                * dome * particleConfig.orbitStrength * scaledMouseRadius * activity;
              targetX += tX * invLen * orbitVal;
              targetY += tY * invLen * orbitVal;
              targetZ += tZ * invLen * orbitVal;
            }
          }

          hasTarget = true;

          if (particleConfig.mouseSizeEffect) {
            const baseBulge = 0.3;
            const sizeFactor = baseBulge + (1.0 - baseBulge) * activity;
            sizeMulTarget = 1.0 + dome * particleConfig.mouseSizeStrength * sizeFactor;
          }
        }
      }

      // Height-based size effect
      if (activeHeightSize) {
        const y = baseY - effectiveCenter.y; // local Y (relative to shape center)
        const normalizedY = (y - activeHeightSize.yMin) / (activeHeightSize.yMax - activeHeightSize.yMin || 1);
        const clampedY = Math.max(0, Math.min(1, normalizedY));
        const heightMul = activeHeightSize.min + (activeHeightSize.max - activeHeightSize.min) * clampedY;
        sizeMulTarget *= heightMul;
      }

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

    // Update geometry buffers
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    const mulAttr = this.points.geometry.getAttribute('mouseMul') as THREE.BufferAttribute;
    if (mulAttr) mulAttr.needsUpdate = true;
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }
  }
}
