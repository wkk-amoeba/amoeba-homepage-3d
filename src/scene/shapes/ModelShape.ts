import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { getCircleTexture } from '../../utils/circleTexture';
import { ModelData, waitPositions, scrollConfig, animationPhases, getParticleMultiplier, PERFORMANCE_CONFIG } from '../../config/sceneConfig';

export class ModelShape {
  private scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private data: ModelData;
  private sectionStart: number;
  private sectionEnd: number;
  private loaded = false;

  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();

  constructor(scene: THREE.Scene, data: ModelData, sectionIndex: number) {
    this.scene = scene;
    this.data = data;

    this.sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
    this.sectionEnd = this.sectionStart + scrollConfig.sectionDuration;

    this.loadModel();
  }

  private loadModel() {
    const loader = new GLTFLoader();

    // Set up Draco decoder for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      this.data.modelPath,
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
          console.error(`No vertices found in model: ${this.data.name}`);
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

        // 1단계: 바운딩 박스 계산 후 정규화 (모든 모델을 일정 크기로)
        geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          // 중앙 정렬
          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);

          // 바운딩 박스 크기 계산
          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          const maxDimension = Math.max(size.x, size.y, size.z);

          // 목표 크기로 정규화 (기본 크기 8 유닛)
          const targetSize = 8;
          const normalizeScale = targetSize / maxDimension;
          geometry.scale(normalizeScale, normalizeScale, normalizeScale);

          // 2단계: 개별 모델 스케일 적용 (미세 조정용)
          geometry.scale(this.data.scale, this.data.scale, this.data.scale);

          console.log(`${this.data.name}: original size ${maxDimension.toFixed(2)}, normalized to ${targetSize}, final scale ${this.data.scale}`);
        }

        const material = new THREE.PointsMaterial({
          transparent: true,
          color: 0xffffff,
          size: 0.03,
          sizeAttenuation: true,
          depthWrite: false,
          opacity: 0,
          map: getCircleTexture(),
          alphaMap: getCircleTexture(),
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = PERFORMANCE_CONFIG.enableFrustumCulling;

        // Set initial position
        const waitPos = waitPositions[this.data.animation] || [0, 0, -20];
        this.points.position.set(...waitPos);
        this.points.scale.setScalar(1);

        this.scene.add(this.points);
        this.loaded = true;

        console.log(`Loaded: ${this.data.name} (${positions.length / 3} vertices, sampled from ${totalVertexCount})`);
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        console.log(`Loading ${this.data.name}: ${percent.toFixed(1)}%`);
      },
      (error) => {
        console.error(`Error loading ${this.data.name}:`, error);
      }
    );
  }

  // 이징 함수
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  private easeInQuad(t: number): number {
    return t * t;
  }

  // 애니메이션 타입별 대기/중앙/퇴장 위치 정의
  private getAnimationPositions(): {
    wait: [number, number, number];
    center: [number, number, number];
    exit: [number, number, number];
  } {
    switch (this.data.animation) {
      case 'left-to-center':
        return {
          wait: [-5, -2, 2],
          center: [0, 0, 2],
          exit: [5, 2, 2],
        };
      case 'right-to-center':
        return {
          wait: [5, -2, 2],
          center: [0, 0, 2],
          exit: [-5, 2, 2],
        };
      case 'zoom-through':
        return {
          wait: [0, 0, 15],
          center: [0, 0, 2],
          exit: [0, 0, -10],
        };
      case 'curve-zoom':
        return {
          wait: [6, -3, 2],
          center: [0, 0, 2],
          exit: [-6, 3, 7],
        };
      case 'scatter-to-form':
        return {
          wait: [3, -2, 5],
          center: [0, 0, 2],
          exit: [-3, 2, -5],
        };
      default:
        return {
          wait: [0, 0, -20],
          center: [0, 0, 2],
          exit: [0, 0, 20],
        };
    }
  }

  update(delta: number, scrollProgress: number) {
    if (!this.loaded || !this.points) return;

    const previewStart = this.sectionStart - scrollConfig.previewOffset;
    const isActive = scrollProgress >= previewStart && scrollProgress <= this.sectionEnd + 0.02;

    const material = this.points.material as THREE.PointsMaterial;

    if (!isActive) {
      if (material.opacity > 0.01) {
        material.opacity *= 0.9;
      }
      return;
    }

    const positions = this.getAnimationPositions();
    let targetPosition: [number, number, number] = positions.wait;
    let targetScale = 1;  // 스케일 축소 (기존 3 → 1)
    let targetOpacity = 0;

    const { enterRatio, holdRatio } = animationPhases;

    // Preview phase (프리뷰: 희미하게 보이기 시작)
    if (scrollProgress >= previewStart && scrollProgress < this.sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.3;
      targetPosition = positions.wait;
    }

    // Active section (3단계 애니메이션)
    if (scrollProgress >= this.sectionStart && scrollProgress <= this.sectionEnd) {
      const localProgress = (scrollProgress - this.sectionStart) / (this.sectionEnd - this.sectionStart);

      if (localProgress < enterRatio) {
        // 진입 단계: 대기위치 → 중앙 (easeOutQuad로 부드럽게 감속)
        const enterProgress = this.easeOutQuad(localProgress / enterRatio);
        targetPosition = [
          positions.wait[0] + (positions.center[0] - positions.wait[0]) * enterProgress,
          positions.wait[1] + (positions.center[1] - positions.wait[1]) * enterProgress,
          positions.wait[2] + (positions.center[2] - positions.wait[2]) * enterProgress,
        ];
        targetOpacity = enterProgress;
      } else if (localProgress < enterRatio + holdRatio) {
        // 고정 단계: 중앙에서 정지 (회전만)
        targetPosition = positions.center;
        targetOpacity = 1;
      } else {
        // 퇴장 단계: 중앙 → 퇴장위치 (easeInQuad로 부드럽게 가속)
        const exitProgress = this.easeInQuad((localProgress - enterRatio - holdRatio) / (1 - enterRatio - holdRatio));
        targetPosition = [
          positions.center[0] + (positions.exit[0] - positions.center[0]) * exitProgress,
          positions.center[1] + (positions.exit[1] - positions.center[1]) * exitProgress,
          positions.center[2] + (positions.exit[2] - positions.center[2]) * exitProgress,
        ];
        targetOpacity = 1 - exitProgress;
      }
    }

    // Smooth interpolation
    this.tempPosition.set(...targetPosition);
    this.tempScale.setScalar(targetScale);
    this.points.position.lerp(this.tempPosition, 0.08);
    this.points.scale.lerp(this.tempScale, 0.08);

    // Rotation (고정 단계에서도 약간 회전)
    this.points.rotation.x += delta * 0.15;
    this.points.rotation.y += delta * 0.1;

    // Opacity
    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }
  }
}
