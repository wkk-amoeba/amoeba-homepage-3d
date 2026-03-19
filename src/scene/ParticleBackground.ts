import * as THREE from 'three';
import { createBackgroundParticles } from '../utils/shapeGenerators';
import { getCircleTexture } from '../utils/circleTexture';
import { backgroundConfig, particleConfig, getAdjustedParticleCount } from '../config/sceneConfig';

export class ParticleBackground {
  private points: THREE.Points;
  private lightDirUniform: { value: THREE.Vector3 };
  private lightAmbientUniform = { value: particleConfig.lightAmbient };
  private lightDiffuseUniform = { value: particleConfig.lightDiffuse };

  // Exclusion zone uniforms
  private objectCenterUniform = { value: new THREE.Vector3(0, 0, 2) };
  private exclusionRadiusUniform = { value: backgroundConfig.exclusionRadius };
  private exclusionFadeUniform = { value: backgroundConfig.exclusionFade };

  // Fade-in animation (triggered by intro-gather-threshold event)
  private fadeStarted = false;
  private fadeElapsed = 0;
  private fadeDuration = 1.0; // 3s fade
  private fadeComplete = false;

  constructor(scene: THREE.Scene) {
    const count = getAdjustedParticleCount(backgroundConfig.count);
    const positions = createBackgroundParticles(
      count,
      backgroundConfig.radius,
      backgroundConfig.height,
      backgroundConfig.minRadius
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Normalize light direction
    const ld = particleConfig.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    this.lightDirUniform = { value: new THREE.Vector3(ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen) };

    const material = new THREE.PointsMaterial({
      transparent: true,
      color: 0xffffff,
      size: backgroundConfig.size * 2,
      sizeAttenuation: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    // Lighting shader injection (same as ParticleMorpher, using position as normal)
    const lightDirRef = this.lightDirUniform;
    const lightAmbientRef = this.lightAmbientUniform;
    const lightDiffuseRef = this.lightDiffuseUniform;
    const objectCenterRef = this.objectCenterUniform;
    const exclusionRadiusRef = this.exclusionRadiusUniform;
    const exclusionFadeRef = this.exclusionFadeUniform;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.lightDir = lightDirRef;
      shader.uniforms.lightAmbient = lightAmbientRef;
      shader.uniforms.lightDiffuse = lightDiffuseRef;
      shader.uniforms.objectCenter = objectCenterRef;
      shader.uniforms.exclusionRadius = exclusionRadiusRef;
      shader.uniforms.exclusionFade = exclusionFadeRef;

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `uniform vec3 lightDir;
uniform float lightAmbient;
uniform float lightDiffuse;
uniform vec3 objectCenter;
uniform float exclusionRadius;
uniform float exclusionFade;
varying float vBrightness;
varying float vExclusionFade;
void main() {`
      );

      shader.vertexShader = shader.vertexShader.replace(
        'if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );',
        `if ( isPerspective ) {
            gl_PointSize *= ( scale / - mvPosition.z );
            vec3 worldNormal = normalize(mat3(modelMatrix) * position);
            float diff = max(dot(worldNormal, lightDir), 0.0);
            vBrightness = lightAmbient + lightDiffuse * diff;
            // Screen-space exclusion zone
            vec4 objClip = projectionMatrix * viewMatrix * vec4(objectCenter, 1.0);
            vec2 objNDC = objClip.xy / objClip.w;
            vec4 myClip = projectionMatrix * mvPosition;
            vec2 myNDC = myClip.xy / myClip.w;
            float screenDist = length(myNDC - objNDC);
            vExclusionFade = smoothstep(exclusionRadius, exclusionRadius + exclusionFade, screenDist);
            gl_PointSize *= vExclusionFade;
          }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        'varying float vBrightness;\nvarying float vExclusionFade;\nvoid main() {'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb *= vBrightness;\ngl_FragColor.a *= vExclusionFade;'
      );
    };

    // Stencil: only draw where object particles have NOT been drawn (stencil ≠ 1)
    material.stencilWrite = false;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    material.stencilRef = 1;

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.points.visible = backgroundConfig.enabled;
    scene.add(this.points);

    // Listen for intro gather reaching 80% to start fade-in
    window.addEventListener('intro-gather-threshold', () => {
      this.fadeStarted = true;
    }, { once: true });
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

  setLightDirection(x: number, y: number, z: number) {
    const len = Math.sqrt(x * x + y * y + z * z);
    this.lightDirUniform.value.set(x / len, y / len, z / len);
  }

  setObjectCenter(pos: THREE.Vector3) {
    this.objectCenterUniform.value.copy(pos);
  }

  setExclusionRadius(v: number) { this.exclusionRadiusUniform.value = v; }
  setExclusionFade(v: number) { this.exclusionFadeUniform.value = v; }

  setLightAmbient(v: number) { this.lightAmbientUniform.value = v; }
  setLightDiffuse(v: number) { this.lightDiffuseUniform.value = v; }

  update(delta: number) {
    // Flow right-to-left with wrap-around (stays behind object)
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const speed = backgroundConfig.rotationSpeed * 2;
    const r = backgroundConfig.radius;
    for (let i = 0; i < posAttr.count; i++) {
      arr[i * 3] += speed * delta; // move right (positive X)
      if (arr[i * 3] > r) {
        arr[i * 3] -= r * 2; // wrap to left side
      }
    }
    posAttr.needsUpdate = true;

    // Fade-in triggered by intro gather reaching 80%
    if (!this.fadeComplete) {
      if (!this.fadeStarted) {
        return;
      }
      this.fadeElapsed += delta;
      const fadeT = Math.min(1, this.fadeElapsed / this.fadeDuration);
      const eased = fadeT * fadeT * (3 - 2 * fadeT); // smoothstep
      const mat = this.points.material as THREE.PointsMaterial;
      mat.opacity = backgroundConfig.opacity * eased;
      if (fadeT >= 1) {
        this.fadeComplete = true;
      }
    }
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
