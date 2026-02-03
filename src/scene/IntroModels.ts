import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { getCircleTexture } from '../utils/circleTexture';
import { introModelsConfig, scrollConfig, scatterDirections, getParticleMultiplier, PERFORMANCE_CONFIG } from '../config/sceneConfig';

interface LoadedModel {
  points: THREE.Points;
  initialPos: [number, number, number];
  loaded: boolean;
}

export class IntroModels {
  private scene: THREE.Scene;
  private models: LoadedModel[] = [];
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loadModels();
  }

  private loadModels() {
    const loader = new GLTFLoader();

    // Set up Draco decoder for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    introModelsConfig.forEach((config, index) => {
      // Create placeholder - will be replaced when model loads
      const placeholder: LoadedModel = {
        points: new THREE.Points(),
        initialPos: config.initialPos,
        loaded: false,
      };
      this.models.push(placeholder);

      loader.load(
        config.modelPath,
        (gltf) => {
          // Extract vertices from all meshes
          const allVertices: number[] = [];

          // First pass: count total vertices
          let totalVertexCount = 0;
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
              const posAttr = child.geometry.getAttribute('position');
              if (posAttr) totalVertexCount += posAttr.count;
            }
          });

          if (totalVertexCount === 0) {
            console.error(`No vertices found in intro model: ${index}`);
            return;
          }

          // Calculate sampling step based on max vertices limit
          const maxVertices = PERFORMANCE_CONFIG.maxVerticesPerModel;
          const multiplier = getParticleMultiplier();
          const targetCount = Math.min(maxVertices, totalVertexCount);
          const finalCount = Math.floor(targetCount * multiplier);
          const step = Math.max(1, Math.ceil(totalVertexCount / finalCount));

          // Second pass: sample vertices uniformly
          let vertexIndex = 0;
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
              const geometry = child.geometry;
              const positionAttribute = geometry.getAttribute('position');

              if (positionAttribute) {
                child.updateMatrixWorld(true);
                const worldMatrix = child.matrixWorld;

                const vertex = new THREE.Vector3();
                for (let i = 0; i < positionAttribute.count; i++) {
                  if (vertexIndex % step === 0) {
                    vertex.fromBufferAttribute(positionAttribute, i);
                    vertex.applyMatrix4(worldMatrix);
                    allVertices.push(vertex.x, vertex.y, vertex.z);
                  }
                  vertexIndex++;
                }
              }
            }
          });

          const positions = new Float32Array(allVertices);

          // Create point cloud geometry
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

          // Apply model scale
          const scale = config.scale * 0.6;
          geometry.scale(scale, scale, scale);

          // Center the geometry
          geometry.computeBoundingBox();
          if (geometry.boundingBox) {
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);
          }

          const material = new THREE.PointsMaterial({
            transparent: true,
            color: 0xffffff,
            size: 0.02,
            sizeAttenuation: true,
            depthWrite: false,
            opacity: 1,
            map: getCircleTexture(),
            alphaMap: getCircleTexture(),
          });

          const points = new THREE.Points(geometry, material);
          points.frustumCulled = PERFORMANCE_CONFIG.enableFrustumCulling;
          points.position.set(...config.initialPos);

          this.scene.add(points);

          // Update the placeholder
          placeholder.points = points;
          placeholder.loaded = true;

          console.log(`Intro model loaded: ${index} (${positions.length / 3} vertices, sampled from ${totalVertexCount})`);
        },
        undefined,
        (error) => {
          console.error(`Error loading intro model ${index}:`, error);
        }
      );
    });
  }

  update(delta: number, scrollProgress: number) {
    const fadeProgress = Math.min(1, scrollProgress / scrollConfig.introEnd);

    this.models.forEach((model, index) => {
      if (!model.loaded) return;

      const dir = scatterDirections[index] || [0, 0, -10];

      const targetX = model.initialPos[0] + dir[0] * fadeProgress;
      const targetY = model.initialPos[1] + dir[1] * fadeProgress;
      const targetZ = model.initialPos[2] + dir[2] * fadeProgress;

      this.tempPosition.set(targetX, targetY, targetZ);
      model.points.position.lerp(this.tempPosition, 0.1);

      const baseScale = introModelsConfig[index].scale * 0.6;
      const targetScaleVal = baseScale * (1 - fadeProgress * 0.8);
      this.tempScale.set(targetScaleVal, targetScaleVal, targetScaleVal);
      model.points.scale.lerp(this.tempScale, 0.1);

      // Opacity
      const targetOpacity = 1 - fadeProgress;
      const material = model.points.material as THREE.PointsMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);

      // Rotation
      model.points.rotation.x += delta * 0.3;
      model.points.rotation.y += delta * 0.2;
    });
  }

  dispose() {
    this.models.forEach((model) => {
      if (model.loaded) {
        model.points.geometry.dispose();
        (model.points.material as THREE.Material).dispose();
        this.scene.remove(model.points);
      }
    });
  }
}
