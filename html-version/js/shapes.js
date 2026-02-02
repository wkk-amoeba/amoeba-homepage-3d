/**
 * shapes.js - 도형별 점(Point) 생성 함수
 * 원본: Scene.tsx의 createShapePoints 함수
 */

const ShapeGenerator = {
  /**
   * 정육면체 표면에 점 분포
   */
  createBoxPoints: function(count) {
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const face = Math.floor(Math.random() * 6);
      const u = Math.random() - 0.5;
      const v = Math.random() - 0.5;

      switch (face) {
        case 0: positions[i * 3] = 0.5; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break;
        case 1: positions[i * 3] = -0.5; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break;
        case 2: positions[i * 3] = u; positions[i * 3 + 1] = 0.5; positions[i * 3 + 2] = v; break;
        case 3: positions[i * 3] = u; positions[i * 3 + 1] = -0.5; positions[i * 3 + 2] = v; break;
        case 4: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = 0.5; break;
        case 5: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = -0.5; break;
      }
    }

    return positions;
  },

  /**
   * 구 표면에 균일 분포 (피보나치)
   */
  createSpherePoints: function(count) {
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 0.5;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    return positions;
  },

  /**
   * 토러스 표면에 점 분포
   */
  createTorusPoints: function(count) {
    const positions = new Float32Array(count * 3);
    const R = 0.5; // 메인 반지름
    const r = 0.2; // 튜브 반지름

    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;

      positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
      positions[i * 3 + 1] = (R + r * Math.cos(v)) * Math.sin(u);
      positions[i * 3 + 2] = r * Math.sin(v);
    }

    return positions;
  },

  /**
   * 팔면체 표면에 점 분포
   */
  createOctahedronPoints: function(count) {
    const positions = new Float32Array(count * 3);

    // 팔면체 꼭지점
    const vertices = [
      [0, 0.6, 0], [0, -0.6, 0],
      [0.6, 0, 0], [-0.6, 0, 0],
      [0, 0, 0.6], [0, 0, -0.6]
    ];

    // 각 면의 3개 꼭지점
    const faceIndices = [
      [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
      [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
    ];

    for (let i = 0; i < count; i++) {
      const face = Math.floor(Math.random() * 8);
      const u = Math.random();
      const v = Math.random() * (1 - u);
      const w = 1 - u - v;

      const [a, b, c] = faceIndices[face];
      positions[i * 3] = vertices[a][0] * u + vertices[b][0] * v + vertices[c][0] * w;
      positions[i * 3 + 1] = vertices[a][1] * u + vertices[b][1] * v + vertices[c][1] * w;
      positions[i * 3 + 2] = vertices[a][2] * u + vertices[b][2] * v + vertices[c][2] * w;
    }

    return positions;
  },

  /**
   * 원뿔 표면에 점 분포
   */
  createConePoints: function(count) {
    const positions = new Float32Array(count * 3);
    const height = 0.8;
    const radius = 0.4;

    for (let i = 0; i < count; i++) {
      const isBase = Math.random() < 0.3; // 30% 확률로 밑면

      if (isBase) {
        // 밑면 (원)
        const r = Math.sqrt(Math.random()) * radius;
        const theta = Math.random() * Math.PI * 2;
        positions[i * 3] = r * Math.cos(theta);
        positions[i * 3 + 1] = -height / 2;
        positions[i * 3 + 2] = r * Math.sin(theta);
      } else {
        // 옆면
        const h = Math.random();
        const currentRadius = radius * (1 - h);
        const theta = Math.random() * Math.PI * 2;
        positions[i * 3] = currentRadius * Math.cos(theta);
        positions[i * 3 + 1] = -height / 2 + h * height;
        positions[i * 3 + 2] = currentRadius * Math.sin(theta);
      }
    }

    return positions;
  },

  /**
   * 화면 전체에 흩어진 랜덤 위치 생성 (scatter-to-form용)
   */
  createScatteredPoints: function(count) {
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;     // x: -10 ~ 10
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15; // y: -7.5 ~ 7.5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 + 5; // z: 0 ~ 10
    }

    return positions;
  },

  /**
   * 도형 타입에 따라 점 생성
   */
  createShapePoints: function(geometry, count) {
    switch (geometry) {
      case 'box': return this.createBoxPoints(count);
      case 'sphere': return this.createSpherePoints(count);
      case 'torus': return this.createTorusPoints(count);
      case 'octahedron': return this.createOctahedronPoints(count);
      case 'cone': return this.createConePoints(count);
      case 'earth': return this.createEarthPoints(count);
      default: return this.createSpherePoints(count);
    }
  },

  /**
   * 위도/경도를 3D 좌표로 변환
   */
  latLonToXYZ: function(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return { x, y, z };
  },

  /**
   * 대륙별 랜덤 점 생성
   */
  generateContinentPoints: function(lonMin, lonMax, latMin, latMax, count) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const lon = lonMin + Math.random() * (lonMax - lonMin);
      const lat = latMin + Math.random() * (latMax - latMin);
      points.push({ lon, lat });
    }
    return points;
  },

  /**
   * 지구본 (대륙) 점 생성
   */
  createEarthPoints: function(count) {
    const positions = [];
    const colors = [];
    const radius = 0.5;

    // 대륙 데이터 (위도/경도 범위, 점 개수)
    const continents = [
      { lonMin: -130, lonMax: -60, latMin: 25, latMax: 70, count: Math.floor(count * 0.21) },   // 북미
      { lonMin: -80, lonMax: -35, latMin: -55, latMax: 12, count: Math.floor(count * 0.13) },   // 남미
      { lonMin: -10, lonMax: 40, latMin: 35, latMax: 70, count: Math.floor(count * 0.11) },     // 유럽
      { lonMin: -20, lonMax: 50, latMin: -35, latMax: 35, count: Math.floor(count * 0.16) },    // 아프리카
      { lonMin: 40, lonMax: 150, latMin: 5, latMax: 75, count: Math.floor(count * 0.31) },      // 아시아
      { lonMin: 110, lonMax: 155, latMin: -45, latMax: -10, count: Math.floor(count * 0.08) },  // 호주
    ];

    // 대륙 점 생성
    continents.forEach(continent => {
      const points = this.generateContinentPoints(
        continent.lonMin, continent.lonMax,
        continent.latMin, continent.latMax,
        continent.count
      );

      points.forEach(point => {
        const pos = this.latLonToXYZ(point.lat, point.lon, radius);
        // 약간의 랜덤 오프셋
        positions.push(
          pos.x + (Math.random() - 0.5) * 0.01,
          pos.y + (Math.random() - 0.5) * 0.01,
          pos.z + (Math.random() - 0.5) * 0.01
        );
        // 흰색 계열
        const brightness = 0.8 + Math.random() * 0.2;
        colors.push(brightness, brightness, brightness);
      });
    });

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors)
    };
  },

  /**
   * 지구 위도/경도선 (그리드) 생성
   */
  createEarthGridPoints: function(radius) {
    const positions = [];
    const colors = [];

    // 위도선
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = 0; lon < 360; lon += 3) {
        const pos = this.latLonToXYZ(lat, lon, radius * 1.01);
        positions.push(pos.x, pos.y, pos.z);
        colors.push(0.2, 0.5, 0.3); // 녹색
      }
    }

    // 경도선
    for (let lon = 0; lon < 360; lon += 30) {
      for (let lat = -90; lat <= 90; lat += 3) {
        const pos = this.latLonToXYZ(lat, lon, radius * 1.01);
        positions.push(pos.x, pos.y, pos.z);
        colors.push(0.2, 0.5, 0.3); // 녹색
      }
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors)
    };
  },

  /**
   * 지구 글로우 파티클 생성
   */
  createEarthGlowPoints: function(count, radius) {
    const positions = [];
    const colors = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius + 0.02 + Math.random() * 0.05;

      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );

      // 연한 녹색/청록색
      colors.push(
        0.5 + Math.random() * 0.3,
        0.9,
        0.7 + Math.random() * 0.3
      );
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors)
    };
  },

  // ============================================
  // GLB/GLTF 모델 → Point Cloud 변환 함수들
  // ============================================

  /**
   * GLB 모델에서 Point Cloud 생성 (메인 함수)
   * @param {THREE.Object3D} gltfScene - 로드된 GLTF scene
   * @param {number} pointCount - 생성할 점 개수
   * @param {string} mode - 샘플링 모드 ('surface', 'vertex', 'weighted')
   * @returns {Float32Array} - 점 위치 배열
   */
  createGLBPoints: function(gltfScene, pointCount, mode) {
    mode = mode || 'surface';

    switch (mode) {
      case 'surface':
        return this.createGLBPointsUniform(gltfScene, pointCount);
      case 'vertex':
        return this.createGLBPointsFromVertices(gltfScene, pointCount);
      case 'weighted':
        return this.createGLBPointsWeighted(gltfScene, pointCount);
      default:
        return this.createGLBPointsUniform(gltfScene, pointCount);
    }
  },

  /**
   * MeshSurfaceSampler를 사용한 균일 표면 샘플링
   * 가장 균등한 분포를 제공하지만 계산 비용이 높음
   */
  createGLBPointsUniform: function(gltfScene, pointCount) {
    const positions = new Float32Array(pointCount * 3);
    let sampleCount = 0;
    const meshes = [];

    // 모든 메시 수집
    gltfScene.traverse(function(child) {
      if (child.isMesh) {
        meshes.push(child);
      }
    });

    if (meshes.length === 0) {
      console.warn('GLB에서 메시를 찾을 수 없습니다.');
      return positions;
    }

    // 메시별로 포인트 분배
    const pointsPerMesh = Math.ceil(pointCount / meshes.length);

    meshes.forEach(function(mesh) {
      if (sampleCount >= pointCount) return;

      try {
        // MeshSurfaceSampler 생성
        var sampler = new THREE.MeshSurfaceSampler(mesh).build();
        var position = new THREE.Vector3();

        var remainingCount = Math.min(pointsPerMesh, pointCount - sampleCount);
        for (var i = 0; i < remainingCount; i++) {
          sampler.sample(position);
          positions[sampleCount * 3] = position.x;
          positions[sampleCount * 3 + 1] = position.y;
          positions[sampleCount * 3 + 2] = position.z;
          sampleCount++;
        }
      } catch (e) {
        console.warn('MeshSurfaceSampler 실패, 정점 기반으로 전환:', e);
        // fallback to vertex-based sampling
        var fallback = this.extractVerticesFromMesh(mesh, pointsPerMesh);
        for (var j = 0; j < fallback.length / 3 && sampleCount < pointCount; j++) {
          positions[sampleCount * 3] = fallback[j * 3];
          positions[sampleCount * 3 + 1] = fallback[j * 3 + 1];
          positions[sampleCount * 3 + 2] = fallback[j * 3 + 2];
          sampleCount++;
        }
      }
    }.bind(this));

    return positions.slice(0, sampleCount * 3);
  },

  /**
   * 정점 기반 샘플링 (빠르지만 분포가 불균등할 수 있음)
   */
  createGLBPointsFromVertices: function(gltfScene, pointCount) {
    var allVertices = this.collectAllVertices(gltfScene);

    if (allVertices.length === 0) {
      console.warn('GLB에서 정점을 찾을 수 없습니다.');
      return new Float32Array(pointCount * 3);
    }

    var sampled = new Float32Array(pointCount * 3);
    var totalVertices = allVertices.length / 3;

    for (var i = 0; i < pointCount; i++) {
      var randomIdx = Math.floor(Math.random() * totalVertices);
      sampled[i * 3] = allVertices[randomIdx * 3];
      sampled[i * 3 + 1] = allVertices[randomIdx * 3 + 1];
      sampled[i * 3 + 2] = allVertices[randomIdx * 3 + 2];
    }

    return sampled;
  },

  /**
   * 가중치 기반 샘플링 (특정 영역 강조)
   */
  createGLBPointsWeighted: function(gltfScene, pointCount, weightAttribute) {
    weightAttribute = weightAttribute || 'color';
    var positions = new Float32Array(pointCount * 3);
    var sampleCount = 0;

    gltfScene.traverse(function(child) {
      if (child.isMesh && sampleCount < pointCount) {
        try {
          var sampler = new THREE.MeshSurfaceSampler(child)
            .setWeightAttribute(weightAttribute)
            .build();

          var position = new THREE.Vector3();
          var remainingCount = pointCount - sampleCount;

          for (var i = 0; i < remainingCount; i++) {
            sampler.sample(position);
            positions[sampleCount * 3] = position.x;
            positions[sampleCount * 3 + 1] = position.y;
            positions[sampleCount * 3 + 2] = position.z;
            sampleCount++;
          }
        } catch (e) {
          console.warn('가중치 샘플링 실패:', e);
        }
      }
    });

    return positions.slice(0, sampleCount * 3);
  },

  /**
   * GLTF scene에서 모든 정점 수집
   */
  collectAllVertices: function(gltfScene) {
    var allPositions = [];

    gltfScene.traverse(function(child) {
      if (child.isMesh) {
        var extracted = this.extractVerticesFromMesh(child);
        if (extracted) {
          for (var i = 0; i < extracted.length; i++) {
            allPositions.push(extracted[i]);
          }
        }
      }
    }.bind(this));

    return new Float32Array(allPositions);
  },

  /**
   * 단일 메시에서 정점 추출
   */
  extractVerticesFromMesh: function(mesh, maxCount) {
    var geometry = mesh.geometry;
    var positions = geometry.getAttribute('position');

    if (!positions) {
      return new Float32Array(0);
    }

    var result = [];
    var count = maxCount ? Math.min(positions.count, maxCount) : positions.count;

    if (geometry.index) {
      // Indexed geometry
      var indexArray = geometry.index.array;
      var posArray = positions.array;
      var indexCount = maxCount ? Math.min(indexArray.length, maxCount) : indexArray.length;

      for (var i = 0; i < indexCount; i++) {
        var idx = indexArray[i];
        result.push(
          posArray[idx * 3],
          posArray[idx * 3 + 1],
          posArray[idx * 3 + 2]
        );
      }
    } else {
      // Non-indexed geometry
      for (var j = 0; j < count; j++) {
        result.push(
          positions.getX(j),
          positions.getY(j),
          positions.getZ(j)
        );
      }
    }

    return new Float32Array(result);
  },

  /**
   * Point Cloud 정규화 (크기 조정)
   * GLB 모델이 너무 크거나 작을 때 사용
   */
  normalizePoints: function(positions, targetSize) {
    targetSize = targetSize || 1.0;

    // 바운딩 박스 계산
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (var i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }

    // 중심점
    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    var centerZ = (minZ + maxZ) / 2;

    // 최대 크기
    var sizeX = maxX - minX;
    var sizeY = maxY - minY;
    var sizeZ = maxZ - minZ;
    var maxSize = Math.max(sizeX, sizeY, sizeZ);

    // 스케일 팩터
    var scale = targetSize / maxSize;

    // 정규화된 위치
    var normalized = new Float32Array(positions.length);
    for (var j = 0; j < positions.length; j += 3) {
      normalized[j] = (positions[j] - centerX) * scale;
      normalized[j + 1] = (positions[j + 1] - centerY) * scale;
      normalized[j + 2] = (positions[j + 2] - centerZ) * scale;
    }

    return normalized;
  }
};
