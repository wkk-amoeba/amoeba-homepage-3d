import * as THREE from 'three';
import { scrollManager } from '../utils/scrollManager';
import { ParticleBackground } from './ParticleBackground';
import { ParticleMorpher } from './shapes/ParticleMorpher';
import { models, particleConfig } from '../config/sceneConfig';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private background: ParticleBackground;
  private particleMorpher: ParticleMorpher | null = null;

  private lastTime = 0;
  private animationId: number | null = null;

  // Mouse tracking for magnetic effect
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private mouseWorldPos: THREE.Vector3 | null = null;
  private prevMouseWorldPos: THREE.Vector3 | null = null;
  private mouseSpeed = 0;
  private mousePlane: THREE.Plane;

  // Dome debug visualization
  private domeDisc: THREE.Mesh;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container #${containerId} not found`);
    }
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 8);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Lights
    this.setupLights();

    // Mouse tracking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2); // z=2 plane

    // Dome debug disc (semi-transparent red circle at mouse position)
    this.domeDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.domeDisc.visible = false;
    this.domeDisc.renderOrder = 999;
    this.scene.add(this.domeDisc);

    // Create objects
    this.background = new ParticleBackground(this.scene);
    this.particleMorpher = new ParticleMorpher(this.scene, models);

    // Event listeners
    this.handleResize = this.handleResize.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseleave', this.handleMouseLeave);
  }

  private setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xec4899, 0.5);
    pointLight.position.set(-10, -10, -5);
    this.scene.add(pointLight);
  }

  private handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private handleMouseMove(event: MouseEvent) {
    // Normalize mouse coordinates to [-1, 1]
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Project mouse onto the z=2 plane (where models sit)
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.mousePlane, intersection);

    this.mouseWorldPos = hit ? intersection : null;
  }

  private handleMouseLeave() {
    this.mouseWorldPos = null;
  }

  start() {
    scrollManager.init('#content');
    this.lastTime = performance.now();
    this.animate(this.lastTime);
  }

  private animate(time: number) {
    this.animationId = requestAnimationFrame(this.animate);

    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;

    scrollManager.tick();
    const scrollProgress = scrollManager.getProgress();

    // Compute mouse world-space speed
    if (this.mouseWorldPos) {
      if (this.prevMouseWorldPos) {
        this.mouseSpeed = this.mouseWorldPos.distanceTo(this.prevMouseWorldPos) / Math.max(delta, 0.001);
      }
      this.prevMouseWorldPos = this.mouseWorldPos.clone();
    } else {
      this.prevMouseWorldPos = null;
      this.mouseSpeed = 0;
    }

    // Update all objects
    this.background.update(delta);
    if (this.particleMorpher) {
      this.particleMorpher.update(delta, scrollProgress, this.mouseWorldPos, this.mouse, this.mouseSpeed);
    }

    // Update dome debug disc
    if (particleConfig.showDomeDebug && this.mouseWorldPos) {
      this.domeDisc.visible = true;
      this.domeDisc.position.set(
        this.mouseWorldPos.x,
        this.mouseWorldPos.y,
        this.mouseWorldPos.z + 0.01
      );
      this.domeDisc.scale.setScalar(particleConfig.mouseRadius);
    } else {
      this.domeDisc.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  getMorpher(): ParticleMorpher | null {
    return this.particleMorpher;
  }

  getBackground(): ParticleBackground {
    return this.background;
  }

  destroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseleave', this.handleMouseLeave);
    scrollManager.destroy();

    if (this.particleMorpher) this.particleMorpher.dispose();

    this.domeDisc.geometry.dispose();
    (this.domeDisc.material as THREE.Material).dispose();
    this.scene.remove(this.domeDisc);

    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
