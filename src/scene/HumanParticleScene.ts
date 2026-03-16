import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { getCircleTexture } from '../utils/circleTexture';

const MAX_PARTICLES = 10000;

export class HumanParticleScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();

  // FBX animation
  private mixer: THREE.AnimationMixer | null = null;
  private skinnedMesh: THREE.SkinnedMesh | null = null;

  // Particles
  private points: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private sampleIndices: Uint32Array | null = null; // vertex indices to sample each frame

  constructor(container: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera — side view
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(300, 100, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 80, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Ground dots
    this.addGroundDots();

    // Load FBX
    this.loadFBX();

    // Resize
    window.addEventListener('resize', this.onResize);

    // Start render loop
    this.animate();
  }

  private async loadFBX() {
    const loader = new FBXLoader();
    const fbx = await loader.loadAsync('/models/Walking.fbx');

    // Find the SkinnedMesh
    let skinnedMesh: THREE.SkinnedMesh | null = null;
    fbx.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMesh = child as THREE.SkinnedMesh;
      }
    });

    if (!skinnedMesh) {
      console.error('No SkinnedMesh found in FBX');
      return;
    }

    const mesh = skinnedMesh as THREE.SkinnedMesh;
    this.skinnedMesh = mesh;

    // Add to scene (invisible — we only use it for skinning computation)
    fbx.visible = false;
    this.scene.add(fbx);

    // Setup animation — strip root motion (walk in place)
    if (fbx.animations.length > 0) {
      const clip = fbx.animations[0];

      // Remove position tracks on the root bone to prevent forward movement
      clip.tracks = clip.tracks.filter((track) => {
        // Mixamo root bone is typically the first bone; position tracks cause drift
        if (track.name.endsWith('.position')) {
          // Keep only hip vertical bob by zeroing X/Z on the root
          const parts = track.name.split('.');
          const boneName = parts[0];
          // The root bone in Mixamo is usually "mixamorigHips"
          if (boneName.includes('Hips') || boneName.includes('hips')) {
            // Zero out the X (lateral) and Z (forward) channels, keep Y (vertical)
            const values = track.values;
            for (let i = 0; i < values.length; i += 3) {
              values[i] = 0;       // X
              // values[i+1] kept   // Y (vertical bob)
              values[i + 2] = 0;   // Z
            }
            return true;
          }
        }
        return true;
      });

      this.mixer = new THREE.AnimationMixer(fbx);
      const action = this.mixer.clipAction(clip);
      action.play();
    }

    // Build sample indices (subsample vertices for performance)
    const geo = mesh.geometry;
    const totalVertices = geo.attributes.position.count;
    const sampleCount = Math.min(MAX_PARTICLES, totalVertices);

    if (sampleCount >= totalVertices) {
      // Use all vertices
      this.sampleIndices = new Uint32Array(totalVertices);
      for (let i = 0; i < totalVertices; i++) this.sampleIndices[i] = i;
    } else {
      // Uniform sampling
      this.sampleIndices = new Uint32Array(sampleCount);
      const step = totalVertices / sampleCount;
      for (let i = 0; i < sampleCount; i++) {
        this.sampleIndices[i] = Math.floor(i * step);
      }
    }

    // Create particle system
    this.particlePositions = new Float32Array(this.sampleIndices.length * 3);
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const material = new THREE.PointsMaterial({
      size: 2.5,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      map: getCircleTexture(),
      alphaMap: getCircleTexture(),
    });

    this.points = new THREE.Points(particleGeo, material);
    this.scene.add(this.points);

    console.log(`Loaded: ${totalVertices} vertices → ${this.sampleIndices.length} particles`);
  }

  private addGroundDots() {
    const count = 400;
    const spread = 400;
    const pts = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pts[i * 3]     = (Math.random() - 0.5) * spread;
      pts[i * 3 + 1] = 0;
      pts[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.5,
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      sizeAttenuation: true,
      depthWrite: false,
      map: getCircleTexture(),
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  private updateParticles() {
    if (!this.skinnedMesh || !this.particlePositions || !this.sampleIndices) return;

    const mesh = this.skinnedMesh;
    const posAttr = mesh.geometry.attributes.position;
    const target = new THREE.Vector3();

    for (let i = 0; i < this.sampleIndices.length; i++) {
      const vertIdx = this.sampleIndices[i];

      // Start from rest-pose vertex position
      target.fromBufferAttribute(posAttr, vertIdx);

      // Apply skinning (bone transforms)
      mesh.applyBoneTransform(vertIdx, target);

      // Apply the mesh's world transform
      target.applyMatrix4(mesh.matrixWorld);

      this.particlePositions[i * 3]     = target.x;
      this.particlePositions[i * 3 + 1] = target.y;
      this.particlePositions[i * 3 + 2] = target.z;
    }

    (this.points!.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // Advance animation
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Extract skinned positions → particles
    this.updateParticles();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
