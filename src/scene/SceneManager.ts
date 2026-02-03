import * as THREE from 'three';
import { scrollManager } from '../utils/scrollManager';
import { ParticleBackground } from './ParticleBackground';
import { ScrollHintParticles } from './ScrollHintParticles';
import { ModelShape } from './shapes/ModelShape';
import { models } from '../config/sceneConfig';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private background: ParticleBackground;
  private scrollHint: ScrollHintParticles;
  private modelObjects: ModelShape[] = [];

  private lastTime = 0;
  private animationId: number | null = null;

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

    // Create objects
    this.background = new ParticleBackground(this.scene);
    this.scrollHint = new ScrollHintParticles(this.scene);
    this.createModels();

    // Event listeners
    window.addEventListener('resize', this.handleResize.bind(this));

    // Animation loop
    this.animate = this.animate.bind(this);
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

  private createModels() {
    models.forEach((modelData, index) => {
      const model = new ModelShape(this.scene, modelData, index);
      this.modelObjects.push(model);
    });
  }

  private handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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

    const scrollProgress = scrollManager.getProgress();

    // Update all objects
    this.background.update(delta);
    this.scrollHint.update(delta, scrollProgress);
    this.modelObjects.forEach(model => model.update(delta, scrollProgress));

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.handleResize);
    scrollManager.destroy();

    // Dispose models
    this.scrollHint.dispose();
    this.modelObjects.forEach(model => model.dispose());

    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
