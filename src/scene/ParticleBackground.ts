import * as THREE from 'three';
import { createBackgroundParticles } from '../utils/shapeGenerators';
import { getCircleTexture } from '../utils/circleTexture';
import { backgroundConfig, particleConfig, getAdjustedParticleCount } from '../config/sceneConfig';

export class ParticleBackground {
  private points: THREE.Points;
  private lightDirUniform: { value: THREE.Vector3 };
  private lightAmbientUniform = { value: particleConfig.lightAmbient };
  private lightDiffuseUniform = { value: particleConfig.lightDiffuse };

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
      opacity: backgroundConfig.opacity,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    // Lighting shader injection (same as ParticleMorpher, using position as normal)
    const lightDirRef = this.lightDirUniform;
    const lightAmbientRef = this.lightAmbientUniform;
    const lightDiffuseRef = this.lightDiffuseUniform;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.lightDir = lightDirRef;
      shader.uniforms.lightAmbient = lightAmbientRef;
      shader.uniforms.lightDiffuse = lightDiffuseRef;

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `uniform vec3 lightDir;
uniform float lightAmbient;
uniform float lightDiffuse;
varying float vBrightness;
void main() {`
      );

      shader.vertexShader = shader.vertexShader.replace(
        'if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );',
        `if ( isPerspective ) {
            gl_PointSize *= ( scale / - mvPosition.z );
            vec3 worldNormal = normalize(mat3(modelMatrix) * position);
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

  setLightDirection(x: number, y: number, z: number) {
    const len = Math.sqrt(x * x + y * y + z * z);
    this.lightDirUniform.value.set(x / len, y / len, z / len);
  }

  setLightAmbient(v: number) { this.lightAmbientUniform.value = v; }
  setLightDiffuse(v: number) { this.lightDiffuseUniform.value = v; }

  update(delta: number) {
    this.points.rotation.y += backgroundConfig.rotationSpeed * delta;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
