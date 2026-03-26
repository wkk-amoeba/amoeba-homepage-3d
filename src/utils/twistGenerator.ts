/**
 * Programmatic twisted rectangular bar generator.
 * Generates particles along a rectangular cross-section bar
 * that twists around the Y axis.
 */

export interface TwistConfig {
  particleCount: number;   // 생성할 파티클 수
  height: number;          // 전체 높이
  barWidth: number;        // 막대 폭 (X)
  barDepth: number;        // 막대 두께 (Z)
  twistTurns: number;      // 총 회전수 (1 = 360도)
}

const DEFAULT_CONFIG: TwistConfig = {
  particleCount: 15000,
  height: 8,
  barWidth: 3,
  barDepth: 0.3,
  twistTurns: 1.5,
};

/**
 * 트위스트 바 파티클 위치 생성
 * Y축을 따라 올라가면서 사각형 단면이 회전하는 구조
 */
export function generateTwistPositions(config?: Partial<TwistConfig>): Float32Array {
  const c = { ...DEFAULT_CONFIG, ...config };
  const { particleCount, height, barWidth, barDepth, twistTurns } = c;

  const positions = new Float32Array(particleCount * 3);
  const halfH = height / 2;
  const halfW = barWidth / 2;
  const halfD = barDepth / 2;

  for (let i = 0; i < particleCount; i++) {
    // Y 위치: -halfH ~ +halfH 균일 분포
    const y = -halfH + Math.random() * height;

    // 사각형 단면 내 랜덤 위치 (표면 + 내부)
    // 표면에 더 많은 점을 배치하여 외곽이 선명하게 보이도록
    let localX: number, localZ: number;
    if (Math.random() < 0.7) {
      // 표면: 4개 면 중 하나에 배치
      const face = Math.floor(Math.random() * 4);
      switch (face) {
        case 0: localX = -halfW + Math.random() * barWidth; localZ = halfD; break;   // 앞면
        case 1: localX = -halfW + Math.random() * barWidth; localZ = -halfD; break;  // 뒷면
        case 2: localX = halfW; localZ = -halfD + Math.random() * barDepth; break;   // 우측
        default: localX = -halfW; localZ = -halfD + Math.random() * barDepth; break; // 좌측
      }
    } else {
      // 내부: 균일 분포
      localX = -halfW + Math.random() * barWidth;
      localZ = -halfD + Math.random() * barDepth;
    }

    // Y 위치에 따른 twist 각도
    const t = (y + halfH) / height; // 0 ~ 1
    const angle = t * twistTurns * Math.PI * 2;

    // Y축 회전 적용
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x = localX * cosA - localZ * sinA;
    const z = localX * sinA + localZ * cosA;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}
