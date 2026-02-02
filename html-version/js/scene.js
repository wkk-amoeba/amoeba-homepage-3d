/**
 * scene.js - Three.js 3D 씬 관리
 * 원본: Scene.tsx (R3F → Vanilla Three.js 변환)
 */

const Scene3D = {
  // Three.js 객체
  scene: null,
  camera: null,
  renderer: null,

  // 오브젝트
  backgroundParticles: null,
  introShapes: [],
  mainShapes: [],

  // 상태
  scrollProgress: 0,
  lastTime: 0,

  // 설정
  shapes: [
    { id: 0, geometry: 'box', color: 0x4f46e5, animation: 'left-to-center', pointCount: 3000 },
    { id: 1, geometry: 'torus', color: 0xec4899, animation: 'scatter-to-form', pointCount: 4000 },
    { id: 2, geometry: 'sphere', color: 0x22c55e, animation: 'left-to-center', pointCount: 5000 },
    { id: 3, geometry: 'octahedron', color: 0xf59e0b, animation: 'zoom-through', pointCount: 3000 },
    { id: 4, geometry: 'cone', color: 0x06b6d4, animation: 'curve-zoom', pointCount: 3500 },
    { id: 5, geometry: 'earth', color: 0x22c55e, animation: 'earth-rotate', pointCount: 3800 },
  ],

  // 애니메이션 대기 위치
  waitPositions: {
    'left-to-center': [-5, -2, 2],
    'right-to-center': [5, -2, 2],
    'zoom-through': [0, 0, 15],
    'curve-zoom': [6, -3, 2],
    'scatter-to-form': [0, 0, 5],
    'earth-rotate': [0, 0, 5],
    'glb-rotate': [0, 0, 5],
    'glb-scatter': [0, 0, 5],
  },

  // GLB 로더
  gltfLoader: null,
  glbShapesLoading: 0,

  // 인트로 도형 흩어짐 방향
  scatterDirections: [
    [-3, 2, -8],
    [4, 3, -10],
    [-4, -2, -9],
    [3, -3, -7],
    [-2, 4, -11],
    [0, 5, -12],
  ],

  /**
   * 초기화
   */
  init: function() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createLights();
    this.createBackgroundParticles();
    this.createIntroShapes();
    this.createMainShapes();

    // GLB 로더 초기화
    if (typeof THREE.GLTFLoader !== 'undefined') {
      this.gltfLoader = new THREE.GLTFLoader();
    }

    window.addEventListener('resize', this.onResize.bind(this));

    this.animate(0);
  },

  /**
   * 씬 생성
   */
  createScene: function() {
    this.scene = new THREE.Scene();
  },

  /**
   * 카메라 생성
   */
  createCamera: function() {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 8);
  },

  /**
   * 렌더러 생성
   */
  createRenderer: function() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const container = document.getElementById('canvas-container');
    container.appendChild(this.renderer.domElement);
  },

  /**
   * 조명 생성
   */
  createLights: function() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xec4899, 0.5);
    pointLight.position.set(-10, -10, -5);
    this.scene.add(pointLight);
  },

  /**
   * 배경 파티클 생성
   */
  createBackgroundParticles: function() {
    const count = 200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false
    });

    this.backgroundParticles = new THREE.Points(geometry, material);
    this.scene.add(this.backgroundParticles);
  },

  /**
   * 인트로 도형 생성
   */
  createIntroShapes: function() {
    const introConfigs = [
      { geometry: 'box', color: 0x4f46e5, pointCount: 1500, position: [0, 0, 0] },
      { geometry: 'torus', color: 0xec4899, pointCount: 2000, position: [1.5, 0.8, -0.5] },
      { geometry: 'sphere', color: 0x22c55e, pointCount: 2500, position: [-1.5, -0.3, 0.3] },
      { geometry: 'octahedron', color: 0xf59e0b, pointCount: 1500, position: [0.8, -1, 0.5] },
      { geometry: 'cone', color: 0x06b6d4, pointCount: 1800, position: [-1, 1, -0.3] },
    ];

    introConfigs.forEach((config, index) => {
      const positions = ShapeGenerator.createShapePoints(config.geometry, config.pointCount);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: config.color,
        size: 0.012,
        transparent: true,
        opacity: 1,
        sizeAttenuation: true,
        depthWrite: false
      });

      const points = new THREE.Points(geometry, material);
      points.position.set(...config.position);
      points.scale.set(0.6, 0.6, 0.6);

      // 추가 데이터 저장
      points.userData = {
        initialPosition: config.position.slice(),
        scatterDirection: this.scatterDirections[index]
      };

      this.introShapes.push(points);
      this.scene.add(points);
    });
  },

  /**
   * 메인 도형 생성
   */
  createMainShapes: function() {
    this.shapes.forEach((config, index) => {
      let shapeObj;

      if (config.geometry === 'glb') {
        // GLB 도형은 비동기로 로드
        this.createGLBShape(config, index);
        return;
      } else if (config.animation === 'scatter-to-form') {
        shapeObj = this.createScatterToFormShape(config, index);
      } else if (config.animation === 'earth-rotate') {
        shapeObj = this.createEarthShape(config, index);
      } else {
        shapeObj = this.createNormalShape(config, index);
      }

      this.mainShapes.push(shapeObj);
      if (shapeObj.group) {
        this.scene.add(shapeObj.group);
      } else {
        this.scene.add(shapeObj.points);
      }
    });
  },

  /**
   * 일반 도형 생성
   */
  createNormalShape: function(config, index) {
    const positions = ShapeGenerator.createShapePoints(config.geometry, config.pointCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: config.color,
      size: 0.015,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    const waitPos = this.waitPositions[config.animation];
    points.position.set(...waitPos);
    points.scale.set(3, 3, 3);

    return {
      points: points,
      config: config,
      sectionIndex: index
    };
  },

  /**
   * Scatter-to-Form 도형 생성 (Torus용)
   */
  createScatterToFormShape: function(config, index) {
    const count = config.pointCount;

    // 흩어진 위치
    const scatteredPositions = ShapeGenerator.createScatteredPoints(count);

    // 토러스 형태 위치
    const torusPositions = ShapeGenerator.createTorusPoints(count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(scatteredPositions.slice(), 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);

    return {
      points: points,
      config: config,
      sectionIndex: index,
      scatteredPositions: scatteredPositions,
      torusPositions: torusPositions,
      torusPosition: [3, -2, 2] // 최종 위치
    };
  },

  /**
   * GLB 모델 → Point Cloud 도형 생성
   * config 예시: { geometry: 'glb', glbPath: 'assets/models/logo.glb', animation: 'glb-rotate', pointCount: 5000, color: 0xff00ff }
   */
  createGLBShape: function(config, index) {
    var self = this;

    if (!this.gltfLoader) {
      console.error('GLTFLoader가 로드되지 않았습니다.');
      return;
    }

    this.glbShapesLoading++;

    this.gltfLoader.load(
      config.glbPath,
      function(gltf) {
        // 로드 성공
        console.log('GLB 로드 성공:', config.glbPath);

        // 샘플링 모드 결정
        var samplingMode = config.samplingMode || 'surface';

        // Point Cloud 생성
        var positions = ShapeGenerator.createGLBPoints(gltf.scene, config.pointCount, samplingMode);

        // 정규화 (선택적)
        if (config.normalize !== false) {
          positions = ShapeGenerator.normalizePoints(positions, config.normalizeSize || 1.0);
        }

        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        var material = new THREE.PointsMaterial({
          color: config.color || 0xffffff,
          size: config.pointSize || 0.015,
          transparent: true,
          opacity: 0,
          sizeAttenuation: true,
          depthWrite: false
        });

        var points = new THREE.Points(geometry, material);

        // 초기 위치
        var waitPos = self.waitPositions[config.animation] || [0, 0, 5];
        points.position.set(waitPos[0], waitPos[1], waitPos[2]);
        points.scale.set(config.scale || 3, config.scale || 3, config.scale || 3);

        var shapeObj = {
          points: points,
          config: config,
          sectionIndex: index,
          isGLB: true
        };

        // scatter 애니메이션인 경우 추가 데이터 준비
        if (config.animation === 'glb-scatter') {
          shapeObj.scatteredPositions = ShapeGenerator.createScatteredPoints(config.pointCount);
          shapeObj.targetPositions = positions.slice(); // 원본 복사
          shapeObj.finalPosition = config.finalPosition || [0, 0, 3];
        }

        self.mainShapes.push(shapeObj);
        self.scene.add(points);
        self.glbShapesLoading--;
      },
      function(progress) {
        // 로딩 진행
        if (progress.total > 0) {
          var percent = Math.round(progress.loaded / progress.total * 100);
          console.log('GLB 로딩:', config.glbPath, percent + '%');
        }
      },
      function(error) {
        // 로드 실패
        console.error('GLB 로드 실패:', config.glbPath, error);
        self.glbShapesLoading--;
      }
    );
  },

  /**
   * 지구본 도형 생성
   */
  createEarthShape: function(config, index) {
    const group = new THREE.Group();
    const radius = 0.5;

    // 1. 대륙 파티클
    const earthData = ShapeGenerator.createEarthPoints(config.pointCount);
    const earthGeometry = new THREE.BufferGeometry();
    earthGeometry.setAttribute('position', new THREE.BufferAttribute(earthData.positions, 3));
    earthGeometry.setAttribute('color', new THREE.BufferAttribute(earthData.colors, 3));

    const earthMaterial = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    const earthPoints = new THREE.Points(earthGeometry, earthMaterial);
    group.add(earthPoints);

    // 2. 위도/경도 그리드
    const gridData = ShapeGenerator.createEarthGridPoints(radius);
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.BufferAttribute(gridData.positions, 3));
    gridGeometry.setAttribute('color', new THREE.BufferAttribute(gridData.colors, 3));

    const gridMaterial = new THREE.PointsMaterial({
      size: 0.008,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true
    });

    const gridPoints = new THREE.Points(gridGeometry, gridMaterial);
    group.add(gridPoints);

    // 3. 글로우 파티클
    const glowData = ShapeGenerator.createEarthGlowPoints(500, radius);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowData.positions, 3));
    glowGeometry.setAttribute('color', new THREE.BufferAttribute(glowData.colors, 3));

    const glowMaterial = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    const glowPoints = new THREE.Points(glowGeometry, glowMaterial);
    group.add(glowPoints);

    // 초기 위치 및 스케일
    group.position.set(0, 0, 5);
    group.scale.set(3, 3, 3);

    return {
      group: group,
      points: earthPoints,
      gridPoints: gridPoints,
      glowPoints: glowPoints,
      config: config,
      sectionIndex: index
    };
  },

  /**
   * 리사이즈 처리
   */
  onResize: function() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },

  /**
   * 스크롤 진행도 업데이트
   */
  setScrollProgress: function(progress) {
    this.scrollProgress = progress;
  },

  /**
   * 애니메이션 루프
   */
  animate: function(currentTime) {
    requestAnimationFrame(this.animate.bind(this));

    const delta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.updateBackgroundParticles(delta);
    this.updateIntroShapes(delta);
    this.updateMainShapes(delta);

    this.renderer.render(this.scene, this.camera);
  },

  /**
   * 배경 파티클 업데이트
   */
  updateBackgroundParticles: function(delta) {
    if (this.backgroundParticles) {
      this.backgroundParticles.rotation.y += delta * 0.02;
    }
  },

  /**
   * 인트로 도형 업데이트
   */
  updateIntroShapes: function(delta) {
    const introEnd = 0.1;
    const fadeProgress = Math.min(1, this.scrollProgress / introEnd);

    this.introShapes.forEach((points, index) => {
      const initial = points.userData.initialPosition;
      const dir = points.userData.scatterDirection;

      // 목표 위치 계산
      const targetX = initial[0] + dir[0] * fadeProgress;
      const targetY = initial[1] + dir[1] * fadeProgress;
      const targetZ = initial[2] + dir[2] * fadeProgress;

      // 부드러운 보간
      points.position.x += (targetX - points.position.x) * 0.1;
      points.position.y += (targetY - points.position.y) * 0.1;
      points.position.z += (targetZ - points.position.z) * 0.1;

      // 스케일 감소
      const targetScale = 0.6 * (1 - fadeProgress * 0.8);
      points.scale.setScalar(points.scale.x + (targetScale - points.scale.x) * 0.1);

      // 투명도 감소
      points.material.opacity += ((1 - fadeProgress) - points.material.opacity) * 0.1;

      // 회전
      points.rotation.x += delta * 0.3;
      points.rotation.y += delta * 0.2;
    });
  },

  /**
   * 메인 도형 업데이트
   */
  updateMainShapes: function(delta) {
    this.mainShapes.forEach((shapeObj) => {
      if (shapeObj.config.animation === 'scatter-to-form') {
        this.updateScatterToFormShape(shapeObj, delta);
      } else if (shapeObj.config.animation === 'earth-rotate') {
        this.updateEarthShape(shapeObj, delta);
      } else if (shapeObj.config.animation === 'glb-rotate') {
        this.updateGLBRotateShape(shapeObj, delta);
      } else if (shapeObj.config.animation === 'glb-scatter') {
        this.updateGLBScatterShape(shapeObj, delta);
      } else {
        this.updateNormalShape(shapeObj, delta);
      }
    });
  },

  /**
   * 일반 도형 애니메이션 업데이트
   */
  updateNormalShape: function(shapeObj, delta) {
    const { points, config, sectionIndex } = shapeObj;

    // 섹션 범위 계산
    const sectionStart = 0.1 + sectionIndex * 0.18;
    const sectionEnd = sectionStart + 0.16;

    let targetPosition = this.waitPositions[config.animation].slice();
    let targetScale = 3;
    let targetOpacity = 0;

    // 미리보기 (섹션 진입 전)
    const previewStart = sectionStart - 0.05;
    if (this.scrollProgress >= previewStart && this.scrollProgress < sectionStart) {
      const previewProgress = (this.scrollProgress - previewStart) / 0.05;
      targetOpacity = previewProgress * 0.3;
    }

    // 현재 섹션
    if (this.scrollProgress >= sectionStart && this.scrollProgress <= sectionEnd) {
      const localProgress = (this.scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      switch (config.animation) {
        case 'left-to-center':
          targetPosition = [
            -5 + localProgress * 2,
            -2 + localProgress * 1.5,
            2
          ];
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;

        case 'right-to-center':
          targetPosition = [
            5 - localProgress * 2,
            -2 + localProgress * 1.5,
            2
          ];
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;

        case 'zoom-through':
          targetPosition = [0, 0, 15 - localProgress * 30];
          targetOpacity = localProgress > 0.7 ? Math.max(0, (1 - localProgress) * 3.3) : 1;
          break;

        case 'curve-zoom':
          const curveT = localProgress;
          targetPosition = [
            6 - curveT * 8,
            -3 + Math.sin(curveT * Math.PI) * 4,
            2 + curveT * 5
          ];
          targetOpacity = curveT > 0.85 ? (1 - curveT) * 6.7 : 1;
          break;
      }
    }

    // 부드러운 보간
    points.position.x += (targetPosition[0] - points.position.x) * 0.06;
    points.position.y += (targetPosition[1] - points.position.y) * 0.06;
    points.position.z += (targetPosition[2] - points.position.z) * 0.06;

    points.scale.setScalar(points.scale.x + (targetScale - points.scale.x) * 0.06);
    points.material.opacity += (targetOpacity - points.material.opacity) * 0.1;

    // 회전
    points.rotation.x += delta * 0.2;
    points.rotation.y += delta * 0.15;
  },

  /**
   * Scatter-to-Form 애니메이션 업데이트
   */
  updateScatterToFormShape: function(shapeObj, delta) {
    const { points, sectionIndex, scatteredPositions, torusPositions, torusPosition } = shapeObj;

    // 섹션 범위 계산
    const sectionStart = 0.1 + sectionIndex * 0.18;
    const sectionEnd = sectionStart + 0.16;

    let targetOpacity = 0;
    let morphProgress = 0;

    // 미리보기
    const previewStart = sectionStart - 0.05;
    if (this.scrollProgress >= previewStart && this.scrollProgress < sectionStart) {
      const previewProgress = (this.scrollProgress - previewStart) / 0.05;
      targetOpacity = previewProgress * 0.5;
      morphProgress = 0;
    }

    // 현재 섹션
    if (this.scrollProgress >= sectionStart && this.scrollProgress <= sectionEnd) {
      const localProgress = (this.scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      // Phase 1 (0~0.3): fade in
      // Phase 2 (0.3~0.9): morph to torus
      // Phase 3 (0.9~1): fade out
      if (localProgress < 0.3) {
        targetOpacity = Math.min(1, localProgress / 0.3);
        morphProgress = 0;
      } else if (localProgress < 0.9) {
        targetOpacity = 1;
        morphProgress = (localProgress - 0.3) / 0.6;
      } else {
        targetOpacity = Math.max(0, (1 - localProgress) * 10);
        morphProgress = 1;
      }
    }

    // 점 위치 보간
    const positionAttribute = points.geometry.getAttribute('position');
    const positions = positionAttribute.array;
    const count = scatteredPositions.length / 3;

    // easeOutCubic
    const easedProgress = 1 - Math.pow(1 - morphProgress, 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      const scatterX = scatteredPositions[i3];
      const scatterY = scatteredPositions[i3 + 1];
      const scatterZ = scatteredPositions[i3 + 2];

      const torusX = torusPositions[i3] * 3 + torusPosition[0];
      const torusY = torusPositions[i3 + 1] * 3 + torusPosition[1];
      const torusZ = torusPositions[i3 + 2] * 3 + torusPosition[2];

      positions[i3] = scatterX + (torusX - scatterX) * easedProgress;
      positions[i3 + 1] = scatterY + (torusY - scatterY) * easedProgress;
      positions[i3 + 2] = scatterZ + (torusZ - scatterZ) * easedProgress;
    }
    positionAttribute.needsUpdate = true;

    // 토러스 형태가 되면 회전
    if (morphProgress > 0.5) {
      points.rotation.x += delta * 0.2 * (morphProgress - 0.5) * 2;
      points.rotation.y += delta * 0.15 * (morphProgress - 0.5) * 2;
    }

    // 투명도 업데이트
    points.material.opacity += (targetOpacity - points.material.opacity) * 0.1;
  },

  /**
   * 지구본 애니메이션 업데이트
   */
  updateEarthShape: function(shapeObj, delta) {
    const { group, points, gridPoints, glowPoints, sectionIndex } = shapeObj;

    // 섹션 범위 계산
    const sectionStart = 0.1 + sectionIndex * 0.18;
    const sectionEnd = sectionStart + 0.16;

    let targetOpacity = 0;
    let targetPosition = [0, 0, 5];
    let targetScale = 3;

    // 미리보기
    const previewStart = sectionStart - 0.05;
    if (this.scrollProgress >= previewStart && this.scrollProgress < sectionStart) {
      const previewProgress = (this.scrollProgress - previewStart) / 0.05;
      targetOpacity = previewProgress * 0.3;
    }

    // 현재 섹션
    if (this.scrollProgress >= sectionStart && this.scrollProgress <= sectionEnd) {
      const localProgress = (this.scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      // 중앙으로 이동하며 확대
      targetPosition = [
        0,
        0,
        5 - localProgress * 2  // 5 → 3 (가까워짐)
      ];
      targetScale = 3 + localProgress * 1; // 3 → 4 (커짐)
      targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
    }

    // 위치 보간
    group.position.x += (targetPosition[0] - group.position.x) * 0.06;
    group.position.y += (targetPosition[1] - group.position.y) * 0.06;
    group.position.z += (targetPosition[2] - group.position.z) * 0.06;

    // 스케일 보간
    const currentScale = group.scale.x;
    group.scale.setScalar(currentScale + (targetScale - currentScale) * 0.06);

    // 자동 회전 (항상)
    group.rotation.y += delta * 0.3;

    // 투명도 업데이트
    points.material.opacity += (targetOpacity * 0.9 - points.material.opacity) * 0.1;
    gridPoints.material.opacity += (targetOpacity * 0.3 - gridPoints.material.opacity) * 0.1;
    glowPoints.material.opacity += (targetOpacity * 0.7 - glowPoints.material.opacity) * 0.1;
  },

  /**
   * GLB 회전 애니메이션 업데이트 (Earth와 유사)
   */
  updateGLBRotateShape: function(shapeObj, delta) {
    var points = shapeObj.points;
    var config = shapeObj.config;
    var sectionIndex = shapeObj.sectionIndex;

    // 섹션 범위 계산
    var sectionStart = 0.1 + sectionIndex * 0.18;
    var sectionEnd = sectionStart + 0.16;

    var targetOpacity = 0;
    var targetPosition = this.waitPositions[config.animation] || [0, 0, 5];
    var targetScale = config.scale || 3;

    // 미리보기
    var previewStart = sectionStart - 0.05;
    if (this.scrollProgress >= previewStart && this.scrollProgress < sectionStart) {
      var previewProgress = (this.scrollProgress - previewStart) / 0.05;
      targetOpacity = previewProgress * 0.3;
    }

    // 현재 섹션
    if (this.scrollProgress >= sectionStart && this.scrollProgress <= sectionEnd) {
      var localProgress = (this.scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      // 중앙으로 이동하며 확대
      targetPosition = [
        0,
        0,
        5 - localProgress * 2  // 5 → 3
      ];
      targetScale = (config.scale || 3) + localProgress * 1;
      targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
    }

    // 위치 보간
    points.position.x += (targetPosition[0] - points.position.x) * 0.06;
    points.position.y += (targetPosition[1] - points.position.y) * 0.06;
    points.position.z += (targetPosition[2] - points.position.z) * 0.06;

    // 스케일 보간
    var currentScale = points.scale.x;
    points.scale.setScalar(currentScale + (targetScale - currentScale) * 0.06);

    // 자동 회전
    points.rotation.y += delta * 0.3;
    points.rotation.x += delta * 0.1;

    // 투명도 업데이트
    points.material.opacity += (targetOpacity - points.material.opacity) * 0.1;
  },

  /**
   * GLB Scatter-to-Form 애니메이션 업데이트
   */
  updateGLBScatterShape: function(shapeObj, delta) {
    var points = shapeObj.points;
    var config = shapeObj.config;
    var sectionIndex = shapeObj.sectionIndex;
    var scatteredPositions = shapeObj.scatteredPositions;
    var targetPositions = shapeObj.targetPositions;
    var finalPosition = shapeObj.finalPosition;

    // 섹션 범위 계산
    var sectionStart = 0.1 + sectionIndex * 0.18;
    var sectionEnd = sectionStart + 0.16;

    var targetOpacity = 0;
    var morphProgress = 0;

    // 미리보기
    var previewStart = sectionStart - 0.05;
    if (this.scrollProgress >= previewStart && this.scrollProgress < sectionStart) {
      var previewProgress = (this.scrollProgress - previewStart) / 0.05;
      targetOpacity = previewProgress * 0.5;
      morphProgress = 0;
    }

    // 현재 섹션
    if (this.scrollProgress >= sectionStart && this.scrollProgress <= sectionEnd) {
      var localProgress = (this.scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      if (localProgress < 0.3) {
        targetOpacity = Math.min(1, localProgress / 0.3);
        morphProgress = 0;
      } else if (localProgress < 0.9) {
        targetOpacity = 1;
        morphProgress = (localProgress - 0.3) / 0.6;
      } else {
        targetOpacity = Math.max(0, (1 - localProgress) * 10);
        morphProgress = 1;
      }
    }

    // 점 위치 보간
    var positionAttribute = points.geometry.getAttribute('position');
    var positions = positionAttribute.array;
    var count = Math.min(scatteredPositions.length, targetPositions.length) / 3;

    // easeOutCubic
    var easedProgress = 1 - Math.pow(1 - morphProgress, 3);

    for (var i = 0; i < count; i++) {
      var i3 = i * 3;

      var scatterX = scatteredPositions[i3];
      var scatterY = scatteredPositions[i3 + 1];
      var scatterZ = scatteredPositions[i3 + 2];

      // 타겟 위치 + 최종 위치 오프셋
      var targetX = targetPositions[i3] * (config.scale || 3) + finalPosition[0];
      var targetY = targetPositions[i3 + 1] * (config.scale || 3) + finalPosition[1];
      var targetZ = targetPositions[i3 + 2] * (config.scale || 3) + finalPosition[2];

      positions[i3] = scatterX + (targetX - scatterX) * easedProgress;
      positions[i3 + 1] = scatterY + (targetY - scatterY) * easedProgress;
      positions[i3 + 2] = scatterZ + (targetZ - scatterZ) * easedProgress;
    }
    positionAttribute.needsUpdate = true;

    // 형태가 되면 회전
    if (morphProgress > 0.5) {
      points.rotation.x += delta * 0.2 * (morphProgress - 0.5) * 2;
      points.rotation.y += delta * 0.15 * (morphProgress - 0.5) * 2;
    }

    // 투명도 업데이트
    points.material.opacity += (targetOpacity - points.material.opacity) * 0.1;
  }
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
  Scene3D.init();
});
