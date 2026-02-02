// 도형별 점 생성 함수

export function createShapePoints(geometry: string, count: number): Float32Array {
  const positions = new Float32Array(count * 3);

  switch (geometry) {
    case 'box': {
      // 정육면체 표면에 점 분포
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
      break;
    }
    case 'sphere': {
      // 구 표면에 균일 분포 (피보나치)
      for (let i = 0; i < count; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = 0.5;

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      break;
    }
    case 'torus': {
      // 토러스 표면에 점 분포
      const R = 0.5; // 메인 반지름
      const r = 0.2; // 튜브 반지름

      for (let i = 0; i < count; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI * 2;

        positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
        positions[i * 3 + 1] = (R + r * Math.cos(v)) * Math.sin(u);
        positions[i * 3 + 2] = r * Math.sin(v);
      }
      break;
    }
    case 'octahedron': {
      // 팔면체 표면에 점 분포
      for (let i = 0; i < count; i++) {
        // 랜덤하게 8개 면 중 하나 선택
        const face = Math.floor(Math.random() * 8);
        const u = Math.random();
        const v = Math.random() * (1 - u);
        const w = 1 - u - v;

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

        const [a, b, c] = faceIndices[face];
        positions[i * 3] = vertices[a][0] * u + vertices[b][0] * v + vertices[c][0] * w;
        positions[i * 3 + 1] = vertices[a][1] * u + vertices[b][1] * v + vertices[c][1] * w;
        positions[i * 3 + 2] = vertices[a][2] * u + vertices[b][2] * v + vertices[c][2] * w;
      }
      break;
    }
    case 'cone': {
      // 원뿔 표면에 점 분포
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
      break;
    }
    default: {
      // 기본값: 구
      for (let i = 0; i < count; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        positions[i * 3] = 0.5 * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = 0.5 * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = 0.5 * Math.cos(phi);
      }
    }
  }

  return positions;
}

// 토러스 점 생성 (ScatterToForm용)
export function createTorusPoints(count: number, R: number, r: number): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
    positions[i * 3 + 1] = (R + r * Math.cos(v)) * Math.sin(u);
    positions[i * 3 + 2] = r * Math.sin(v);
  }

  return positions;
}

// 흩어진 위치 생성 (ScatterToForm용)
export function createScatteredPositions(
  count: number,
  range: { x: number; y: number; z: number },
  zOffset: number
): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * range.x;
    positions[i * 3 + 1] = (Math.random() - 0.5) * range.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * range.z + zOffset;
  }

  return positions;
}

// 배경 파티클 위치 생성
export function createBackgroundParticles(
  count: number,
  spread: { x: number; y: number; z: number },
  zOffset: number
): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread.x;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread.z + zOffset;
  }

  return positions;
}
