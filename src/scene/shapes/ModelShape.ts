import * as THREE from 'three';
import { getCircleTexture } from '../../utils/circleTexture';
import { ModelData, ParticleMode, scrollConfig, animationPhases, particleConfig, getParticleMultiplier, PERFORMANCE_CONFIG } from '../../config/sceneConfig';
import { createShapePoints } from '../../utils/shapeGenerators';

export class ModelShape {
  private scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private data: ModelData;
  private sectionStart: number;
  private sectionEnd: number;
  private loaded = false;

  // Per-particle data for scatter-reform and mouse magnetic
  private originalPositions: Float32Array = new Float32Array(0);
  private scatterOffsets: Float32Array = new Float32Array(0);
  private mouseOffset: Float32Array = new Float32Array(0);
  private mouseVelocity: Float32Array = new Float32Array(0); // spring physics
  private sizeMultipliers: Float32Array = new Float32Array(0); // per-particle size for magnetic effect
  private particleCount = 0;
  private isFirstModel: boolean;

  // Debug panel support
  private _totalParticleCount = 0;
  private _visibleParticleCount = 0;
  private _userScale = 1.0;

  // Base rotation (from debug panel)
  private baseRotX = 0;
  private baseRotY = 0;
  private baseRotZ = 0;

  // Smoothed parallax rotation
  private parallaxRotX = 0;
  private parallaxRotY = 0;

  // Orbit time accumulator
  private orbitTime = 0;

  // Mouse activity (velocity-based, 0=still, 1=moving fast)
  private mouseActivity = 0;
  private wasMouseNear = false;

  // (boundingRadius removed — now uses particleConfig.activationRadius)

  // InstancedMesh for tetrahedron mode (lazy-created)
  private instancedMesh: THREE.InstancedMesh | null = null;
  private instancedDummy = new THREE.Object3D();
  private rotationAngles: Float32Array = new Float32Array(0);
  private rotationSpeeds: Float32Array = new Float32Array(0);
  private currentMode: ParticleMode = 'dots';

  // Shared mutable position buffer (used by both modes)
  private currentPositions: Float32Array = new Float32Array(0);

  // Custom shader uniforms for depth-based size control
  private depthNearMulUniform = { value: particleConfig.depthNearMul };
  private depthFarMulUniform = { value: particleConfig.depthFarMul };
  private localZMinUniform = { value: -4.0 };
  private localZMaxUniform = { value: 4.0 };

  // Lighting uniforms (shared across frames, updated by debug panel)
  private lightDirUniform: { value: THREE.Vector3 } | null = null;
  private lightAmbientUniform = { value: particleConfig.lightAmbient };
  private lightDiffuseUniform = { value: particleConfig.lightDiffuse };

  constructor(scene: THREE.Scene, data: ModelData, sectionIndex: number) {
    this.scene = scene;
    this.data = data;
    this.isFirstModel = sectionIndex === 0;

    this.sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
    this.sectionEnd = this.sectionStart + scrollConfig.sectionDuration;

    // Apply config rotation defaults
    if (data.rotation) {
      this.baseRotX = data.rotation[0];
      this.baseRotY = data.rotation[1];
      this.baseRotZ = data.rotation[2];
    }

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
    return this.particleCount;
  }

  get visibleParticleCount(): number {
    return this._visibleParticleCount;
  }

  set visibleParticleCount(count: number) {
    const clamped = Math.max(100, Math.min(count, this.particleCount));
    this._visibleParticleCount = clamped;
    if (this.points) {
      this.points.geometry.setDrawRange(0, clamped);
    }
    if (this.instancedMesh) {
      this.instancedMesh.count = clamped;
    }
  }

  get userScale(): number {
    return this._userScale;
  }

  set userScale(value: number) {
    this._userScale = value;
  }

  get particleSize(): number {
    if (!this.points) return particleConfig.size;
    return (this.points.material as THREE.PointsMaterial).size;
  }

  set particleSize(value: number) {
    if (this.points) {
      (this.points.material as THREE.PointsMaterial).size = value;
    }
  }

  get rotationX(): number {
    return this.baseRotX;
  }

  set rotationX(v: number) {
    this.baseRotX = v;
  }

  get rotationY(): number {
    return this.baseRotY;
  }

  set rotationY(v: number) {
    this.baseRotY = v;
  }

  get rotationZ(): number {
    return this.baseRotZ;
  }

  set rotationZ(v: number) {
    this.baseRotZ = v;
  }

  // --- Mode switching ---

  setMode(mode: ParticleMode) {
    if (mode === this.currentMode || !this.loaded) return;

    if (mode === 'tetrahedron' && !this.instancedMesh) {
      this.createInstancedMesh();
    }

    if (mode === 'dots') {
      if (this.points) this.points.visible = true;
      if (this.instancedMesh) this.instancedMesh.visible = false;
    } else {
      if (this.points) this.points.visible = false;
      if (this.instancedMesh) {
        this.instancedMesh.visible = true;
        // Sync opacity from points material
        const pointsOpacity = (this.points?.material as THREE.PointsMaterial)?.opacity ?? 0;
        (this.instancedMesh.material as THREE.MeshStandardMaterial).opacity = pointsOpacity;
      }
    }

    this.currentMode = mode;
  }

  private createInstancedMesh() {
    const geometry = new THREE.TetrahedronGeometry(1, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      metalness: 0.1,
      roughness: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.particleCount);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.count = this._visibleParticleCount;

    // Copy transform from points
    if (this.points) {
      this.instancedMesh.position.copy(this.points.position);
    }
    this.instancedMesh.visible = false;

    // Per-instance rotation
    this.rotationAngles = new Float32Array(this.particleCount);
    this.rotationSpeeds = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      this.rotationAngles[i] = Math.random() * Math.PI * 2;
      this.rotationSpeeds[i] = particleConfig.tetrahedronRotationSpeed
        * (0.5 + Math.random()); // 0.5x ~ 1.5x speed variance
    }

    // Initialize instance matrices from current positions
    const s = particleConfig.tetrahedronSize;
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      this.instancedDummy.position.set(
        this.currentPositions[i3],
        this.currentPositions[i3 + 1],
        this.currentPositions[i3 + 2]
      );
      this.instancedDummy.rotation.set(0, this.rotationAngles[i], 0);
      this.instancedDummy.scale.setScalar(s);
      this.instancedDummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.instancedDummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.instancedMesh);
  }

  // Lighting accessors for debug panel
  setLightDirection(x: number, y: number, z: number) {
    if (this.lightDirUniform) {
      const len = Math.sqrt(x * x + y * y + z * z);
      this.lightDirUniform.value.set(x / len, y / len, z / len);
    }
  }

  setLightAmbient(v: number) {
    this.lightAmbientUniform.value = v;
  }

  setLightDiffuse(v: number) {
    this.lightDiffuseUniform.value = v;
  }

  // --- End debug panel accessors ---

  private async loadModel() {
    try {
      let sampledPositions: Float32Array;

      if (this.data.geometry) {
        // Programmatic shape generation
        const baseCount = this.data.particleCount ?? PERFORMANCE_CONFIG.maxVerticesPerModel;
        const multiplier = getParticleMultiplier();
        const count = Math.floor(baseCount * multiplier);
        sampledPositions = createShapePoints(this.data.geometry, count);
        this._totalParticleCount = count;
      } else if (this.data.modelPath) {
        // GLB .bin pipeline
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

        // Uniform sub-sampling for lower-end devices
        const multiplier = this.data.particleCount !== undefined
          ? Math.min(this.data.particleCount, this._totalParticleCount) / this._totalParticleCount
          : getParticleMultiplier();

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
          sampledPositions = new Float32Array(positions);
        }
      } else {
        console.error(`No geometry or modelPath for: ${this.data.name}`);
        return;
      }

      this.particleCount = sampledPositions.length / 3;
      this._visibleParticleCount = this.particleCount;

      // Normalize to 8 units (.bin is centered but not size-normalized)
      {
        // Compute bounding box manually
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < this.particleCount; i++) {
          const i3 = i * 3;
          const x = sampledPositions[i3], y = sampledPositions[i3 + 1], z = sampledPositions[i3 + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
        const maxDimension = Math.max(sizeX, sizeY, sizeZ);

        const targetSize = 8;
        const normalizeScale = targetSize / maxDimension;
        const finalScale = normalizeScale * this.data.scale;

        // Apply normalization + per-model scale in-place
        for (let i = 0; i < sampledPositions.length; i++) {
          sampledPositions[i] *= finalScale;
        }

        // Recompute Z bounds after normalization for depth shader
        let normZMin = Infinity, normZMax = -Infinity;
        for (let i = 0; i < this.particleCount; i++) {
          const z = sampledPositions[i * 3 + 2];
          if (z < normZMin) normZMin = z;
          if (z > normZMax) normZMax = z;
        }
        this.localZMinUniform.value = normZMin;
        this.localZMaxUniform.value = normZMax;

        console.log(`${this.data.name}: original size ${maxDimension.toFixed(2)}, normalized to ${targetSize}, final scale ${this.data.scale}, Z range [${normZMin.toFixed(2)}, ${normZMax.toFixed(2)}]`);
      }

      // Store original positions (the target shape)
      this.originalPositions = new Float32Array(sampledPositions);

      // Pre-compute random scatter directions per particle (spherical uniform, distance 5-15)
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

      // Initialize mouse offset and velocity (all zeros)
      this.mouseOffset = new Float32Array(this.particleCount * 3);
      this.mouseVelocity = new Float32Array(this.particleCount * 3);

      // Initialize per-particle size multipliers (1.0 = normal)
      this.sizeMultipliers = new Float32Array(this.particleCount);
      for (let i = 0; i < this.particleCount; i++) this.sizeMultipliers[i] = 1.0;

      // Create shared mutable position buffer
      this.currentPositions = new Float32Array(sampledPositions);

      // Create Points geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));
      geometry.setAttribute('mouseMul', new THREE.BufferAttribute(this.sizeMultipliers, 1));

      const material = new THREE.PointsMaterial({
        transparent: true,
        color: 0xffffff,
        size: particleConfig.size,
        sizeAttenuation: true,
        depthWrite: false,
        opacity: 0,
        map: getCircleTexture(),
        alphaMap: getCircleTexture(),
      });

      // Inject depth-based size multiplier + fake lighting into shaders
      const nearMulRef = this.depthNearMulUniform;
      const farMulRef = this.depthFarMulUniform;
      const zMinRef = this.localZMinUniform;
      const zMaxRef = this.localZMaxUniform;

      // Normalize light direction into class-level uniform
      const ld = particleConfig.lightDirection;
      const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
      this.lightDirUniform = { value: new THREE.Vector3(ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen) };
      const lightDirUniform = this.lightDirUniform;
      const lightAmbientUniform = this.lightAmbientUniform;
      const lightDiffuseUniform = this.lightDiffuseUniform;
      const lightEnabledVal = particleConfig.lightEnabled;

      material.onBeforeCompile = (shader) => {
        shader.uniforms.depthNearMul = nearMulRef;
        shader.uniforms.depthFarMul = farMulRef;
        shader.uniforms.localZMin = zMinRef;
        shader.uniforms.localZMax = zMaxRef;
        shader.uniforms.lightDir = lightDirUniform;
        shader.uniforms.lightAmbient = lightAmbientUniform;
        shader.uniforms.lightDiffuse = lightDiffuseUniform;

        // Add uniforms + varying at global scope (vertex)
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
varying float vBrightness;
void main() {`
        );

        // Replace attenuation: standard atten × depth-interpolated multiplier + compute lighting
        shader.vertexShader = shader.vertexShader.replace(
          'if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );',
          `if ( isPerspective ) {
            gl_PointSize *= ( scale / - mvPosition.z );
            float nearZ = (modelViewMatrix * vec4(0.0, 0.0, localZMax, 1.0)).z;
            float farZ = (modelViewMatrix * vec4(0.0, 0.0, localZMin, 1.0)).z;
            float depthT = clamp((mvPosition.z - nearZ) / (farZ - nearZ), 0.0, 1.0);
            gl_PointSize *= mix(depthNearMul, depthFarMul, depthT);
            gl_PointSize *= mouseMul;
            ${lightEnabledVal ? `
            vec3 normal = normalize(position);
            float diff = max(dot(normal, lightDir), 0.0);
            vBrightness = lightAmbient + lightDiffuse * diff;
            ` : `
            vBrightness = 1.0;
            `}
          }`
        );

        // Fragment shader: add varying + apply brightness
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          'varying float vBrightness;\nvoid main() {'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\ngl_FragColor.rgb *= vBrightness;'
        );
      };

      this.points = new THREE.Points(geometry, material);
      this.points.frustumCulled = PERFORMANCE_CONFIG.enableFrustumCulling;

      // Fixed center position (no movement animation)
      this.points.position.set(0, 0, 2);

      // Apply saved debug overrides from localStorage
      this.applySavedDebugValues();

      this.points.scale.setScalar(this._userScale);

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

  private calculatePhase(scrollProgress: number): { opacity: number; scatterAmount: number } {
    const { enterRatio, holdRatio } = animationPhases;

    // Outside this model's active range
    if (scrollProgress < this.sectionStart || scrollProgress > this.sectionEnd + 0.02) {
      return { opacity: 0, scatterAmount: 1.0 };
    }

    const localProgress = Math.min(1, Math.max(0,
      (scrollProgress - this.sectionStart) / (this.sectionEnd - this.sectionStart)
    ));

    // First model: skip enter phase at scroll=0 (show immediately formed)
    if (this.isFirstModel && localProgress < enterRatio) {
      return { opacity: 1.0, scatterAmount: 0.0 };
    }

    if (localProgress < enterRatio) {
      // Enter phase: particles reform from scattered to shape
      const t = localProgress / enterRatio;
      const eased = this.easeOutQuad(t);
      return { opacity: eased, scatterAmount: 1.0 - eased };
    } else if (localProgress < enterRatio + holdRatio) {
      // Hold phase: fully formed
      return { opacity: 1.0, scatterAmount: 0.0 };
    } else {
      // Exit phase: particles scatter outward
      const t = (localProgress - enterRatio - holdRatio) / (1 - enterRatio - holdRatio);
      const eased = this.easeInQuad(t);
      return { opacity: 1.0 - eased, scatterAmount: eased };
    }
  }

  update(delta: number, scrollProgress: number, mouseWorldPos: THREE.Vector3 | null, mouseNorm?: THREE.Vector2, mouseSpeed?: number) {
    if (!this.loaded || !this.points) return;

    const pointsMaterial = this.points.material as THREE.PointsMaterial;
    const { opacity, scatterAmount } = this.calculatePhase(scrollProgress);

    // Sync depth multiplier uniforms from config
    this.depthNearMulUniform.value = particleConfig.depthNearMul;
    this.depthFarMulUniform.value = particleConfig.depthFarMul;

    // Quick exit if fully invisible and no mouse offset to decay
    const currentOpacity = this.currentMode === 'tetrahedron' && this.instancedMesh
      ? (this.instancedMesh.material as THREE.MeshStandardMaterial).opacity
      : pointsMaterial.opacity;
    if (opacity < 0.01 && currentOpacity < 0.01) {
      return;
    }

    // Update scale from debug panel
    this.points.scale.setScalar(this._userScale);
    if (this.instancedMesh) {
      this.instancedMesh.scale.setScalar(this._userScale);
    }

    // Smooth parallax rotation based on mouse position (screen-space tilt)
    const pStr = particleConfig.parallaxStrength;
    if (mouseNorm && opacity > 0.1) {
      this.parallaxRotX += (-mouseNorm.y * pStr - this.parallaxRotX) * 0.05;
      this.parallaxRotY += (mouseNorm.x * pStr - this.parallaxRotY) * 0.05;
    } else {
      this.parallaxRotX *= 0.95;
      this.parallaxRotY *= 0.95;
    }

    // Base rotation + parallax
    const finalRotX = this.baseRotX + this.parallaxRotX;
    const finalRotY = this.baseRotY + this.parallaxRotY;
    const finalRotZ = this.baseRotZ;

    this.points.rotation.set(finalRotX, finalRotY, finalRotZ);
    if (this.instancedMesh) {
      this.instancedMesh.rotation.set(finalRotX, finalRotY, finalRotZ);
    }

    // --- Compute particle positions (shared by both modes) ---
    // Check if mouse is close enough to the object center for magnetic effect
    let localMousePos: THREE.Vector3 | null = null;
    const activeObject = this.currentMode === 'dots' ? this.points : this.instancedMesh;
    if (mouseWorldPos && opacity > 0.1 && activeObject) {
      const objectCenter = activeObject.position;
      const distToCenter = mouseWorldPos.distanceTo(objectCenter);

      if (distToCenter < particleConfig.activationRadius * this._userScale) {
        localMousePos = activeObject.worldToLocal(mouseWorldPos.clone());
      }
    }

    // Mouse activity: burst on entry, rise on movement, slow ease-out at rest
    const isMouseNear = localMousePos !== null;
    if (isMouseNear && !this.wasMouseNear) {
      this.mouseActivity = 1.0; // burst on first entry
    } else {
      const speedNorm = Math.min((mouseSpeed || 0) * 0.3, 1.0);
      if (speedNorm > this.mouseActivity) {
        this.mouseActivity += (speedNorm - this.mouseActivity) * 0.25;
      } else {
        this.mouseActivity += (speedNorm - this.mouseActivity) * 0.02;
      }
    }
    this.wasMouseNear = isMouseNear;

    // Scale mouseRadius to local space: world radius / object scale = local radius
    const scaledMouseRadius = particleConfig.mouseRadius / this._userScale;
    const mouseRadiusSq = scaledMouseRadius * scaledMouseRadius;
    const useSpring = particleConfig.springEnabled;
    const stiffness = particleConfig.springStiffness;
    const damping = particleConfig.springDamping;
    const clampedDelta = Math.min(delta, 0.033); // cap at ~30fps to prevent spring explosion

    // Compute camera view direction in local space (once, before particle loop)
    // Camera looks down -Z in world; transform to local space via inverse object rotation
    let camDirLocalX = 0, camDirLocalY = 0, camDirLocalZ = -1;
    if (localMousePos && activeObject) {
      const invQ = activeObject.quaternion.clone().invert();
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(invQ);
      camDirLocalX = camDir.x;
      camDirLocalY = camDir.y;
      camDirLocalZ = camDir.z;
    }

    this.orbitTime += delta;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      const x = this.originalPositions[i3] + this.scatterOffsets[i3] * scatterAmount;
      const y = this.originalPositions[i3 + 1] + this.scatterOffsets[i3 + 1] * scatterAmount;
      const z = this.originalPositions[i3 + 2] + this.scatterOffsets[i3 + 2] * scatterAmount;

      // Magnetic attraction + optional size scaling
      let targetX = 0, targetY = 0, targetZ = 0;
      let hasTarget = false;
      let sizeMulTarget = 1.0;

      if (localMousePos) {
        const origX = this.originalPositions[i3];
        const origY = this.originalPositions[i3 + 1];
        const origZ = this.originalPositions[i3 + 2];

        // Vector from mouse to particle in local space
        const dx = origX - localMousePos.x;
        const dy = origY - localMousePos.y;
        const dz = origZ - localMousePos.z;

        // Project onto camera direction to get the along-ray component
        const dot = dx * camDirLocalX + dy * camDirLocalY + dz * camDirLocalZ;

        // Perpendicular component = total - along-ray (this is screen-aligned distance)
        const perpX = dx - dot * camDirLocalX;
        const perpY = dy - dot * camDirLocalY;
        const perpZ = dz - dot * camDirLocalZ;
        const perpDistSq = perpX * perpX + perpY * perpY + perpZ * perpZ;

        if (perpDistSq < mouseRadiusSq) {
          const perpDist = Math.sqrt(perpDistSq);
          const normalizedDist = perpDist / scaledMouseRadius;
          // Cosine dome: smooth falloff, max at center, zero at edges
          const dome = (1 + Math.cos(Math.PI * normalizedDist)) * 0.5;

          const activity = this.mouseActivity;

          // Repel away from mouse (scatter outward, modulated by activity)
          if (perpDist > 0.001) {
            const pushFactor = dome * particleConfig.mouseStrength * activity;
            const invDist = 1 / perpDist;
            // Normalized direction × dome strength × radius (so push scales with dome area)
            targetX = (perpX * invDist) * pushFactor * scaledMouseRadius;
            targetY = (perpY * invDist) * pushFactor * scaledMouseRadius;
            targetZ = (perpZ * invDist) * pushFactor * scaledMouseRadius;
          }

          // Orbital motion (modulated by activity)
          if (particleConfig.orbitStrength > 0 && perpDist > 0.001 && activity > 0.01) {
            const tX = camDirLocalY * perpZ - camDirLocalZ * perpY;
            const tY = camDirLocalZ * perpX - camDirLocalX * perpZ;
            const tZ = camDirLocalX * perpY - camDirLocalY * perpX;
            const tLen = Math.sqrt(tX * tX + tY * tY + tZ * tZ);

            if (tLen > 0.001) {
              const invLen = 1 / tLen;
              const phase = this.scatterOffsets[i3] * 6.283;
              const orbitVal = Math.sin(this.orbitTime * particleConfig.orbitSpeed + phase)
                * dome * particleConfig.orbitStrength * scaledMouseRadius * activity;
              targetX += tX * invLen * orbitVal;
              targetY += tY * invLen * orbitVal;
              targetZ += tZ * invLen * orbitVal;
            }
          }

          hasTarget = true;

          // Size: subtle base bulge always + extra boost when moving
          if (particleConfig.mouseSizeEffect) {
            const baseBulge = 0.3;  // 30% of max at rest
            const sizeFactor = baseBulge + (1.0 - baseBulge) * activity;
            sizeMulTarget = 1.0 + dome * particleConfig.mouseSizeStrength * sizeFactor;
          }
        }
      }

      // Smooth lerp for size multiplier
      const sizeRate = sizeMulTarget > this.sizeMultipliers[i] ? 0.15 : 0.3;
      this.sizeMultipliers[i] += (sizeMulTarget - this.sizeMultipliers[i]) * sizeRate;

      // Apply offset using either spring or lerp
      if (useSpring) {
        // Spring: acceleration = stiffness * (target - offset) - damping * velocity
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
        // Lerp (original behavior)
        if (hasTarget) {
          this.mouseOffset[i3] += (targetX - this.mouseOffset[i3]) * 0.15;
          this.mouseOffset[i3 + 1] += (targetY - this.mouseOffset[i3 + 1]) * 0.15;
          this.mouseOffset[i3 + 2] += (targetZ - this.mouseOffset[i3 + 2]) * 0.15;
        } else {
          // Fast snap-back so particles outside dome don't linger
          const returnRate = 0.3;
          this.mouseOffset[i3] *= (1 - returnRate);
          this.mouseOffset[i3 + 1] *= (1 - returnRate);
          this.mouseOffset[i3 + 2] *= (1 - returnRate);
        }
      }

      this.currentPositions[i3] = x + this.mouseOffset[i3];
      this.currentPositions[i3 + 1] = y + this.mouseOffset[i3 + 1];
      this.currentPositions[i3 + 2] = z + this.mouseOffset[i3 + 2];
    }

    // --- Mode-specific rendering ---
    if (this.currentMode === 'dots') {
      const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      const mulAttr = this.points.geometry.getAttribute('mouseMul') as THREE.BufferAttribute;
      if (mulAttr) mulAttr.needsUpdate = true;
      pointsMaterial.opacity = THREE.MathUtils.lerp(pointsMaterial.opacity, opacity, 0.1);
    } else if (this.instancedMesh) {
      // Update instance matrices with positions + per-instance rotation
      const s = particleConfig.tetrahedronSize;
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        this.rotationAngles[i] += this.rotationSpeeds[i] * delta;

        this.instancedDummy.position.set(
          this.currentPositions[i3],
          this.currentPositions[i3 + 1],
          this.currentPositions[i3 + 2]
        );
        this.instancedDummy.rotation.set(
          this.rotationAngles[i] * 0.7,
          this.rotationAngles[i],
          this.rotationAngles[i] * 0.3
        );
        this.instancedDummy.scale.setScalar(s);
        this.instancedDummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.instancedDummy.matrix);
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;

      const instancedMaterial = this.instancedMesh.material as THREE.MeshStandardMaterial;
      instancedMaterial.opacity = THREE.MathUtils.lerp(instancedMaterial.opacity, opacity, 0.1);
    }
  }

  private applySavedDebugValues() {
    const raw = localStorage.getItem(`debug_model_${this.data.name}`);
    if (!raw || !this.points) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.scale !== undefined) this._userScale = saved.scale;
      if (saved.rotX !== undefined) this.baseRotX = saved.rotX;
      if (saved.rotY !== undefined) this.baseRotY = saved.rotY;
      if (saved.rotZ !== undefined) this.baseRotZ = saved.rotZ;
      if (saved.particles !== undefined) this.visibleParticleCount = saved.particles;
    } catch { /* ignore invalid data */ }
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
      this.scene.remove(this.instancedMesh);
    }
  }
}
