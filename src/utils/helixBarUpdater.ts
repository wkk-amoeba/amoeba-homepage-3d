/**
 * 씬 09: 타원형 나선 경로를 따라 막대(bar)들이 무한히 내려오는 애니메이션.
 *
 * 구조:
 * - 위에서 보면 타원(ellipse) 경로
 * - 막대들이 타원 나선을 따라 위→아래로 연속 이동
 * - 화면 밖으로 나간 막대는 상단에서 재등장 (무한 루프)
 * - 각 막대는 수직 직사각형 (Y축 방향)
 */

import { ParticleMorpher } from '../scene/shapes/ParticleMorpher';

export interface HelixBarConfig {
  barCount: number;          // 나선 위 막대 개수
  barHeight: number;         // 각 막대의 높이
  barWidth: number;          // 각 막대의 폭 (X 로컬)
  barDepth: number;          // 각 막대의 두께 (Z 로컬)
  ellipseA: number;          // 타원 반장축 (X)
  ellipseB: number;          // 타원 반단축 (Z)
  helixTurns: number;        // 나선 총 회전수
  helixHeight: number;       // 나선 전체 높이
  speed: number;             // 이동 속도 (turns/sec)
  particlesPerBar: number;   // 막대당 파티클 수
}

const DEFAULT_CONFIG: HelixBarConfig = {
  barCount: 100,
  barHeight: 2.5, // 1.2
  barWidth: 0.5, // 0.15
  barDepth: 0.08, // 0.08
  ellipseA: 4.0, // 3.0
  ellipseB: 1.5, // 1.5
  helixTurns: 3, // 3
  helixHeight: 10, // 10
  speed: 0.01,
  particlesPerBar: 500,
};

/**
 * 초기 위치 생성 (precomputedPositions용)
 * ParticleMorpher가 로딩할 때 사용
 */
export function generateHelixBarPositions(config?: Partial<HelixBarConfig>): Float32Array {
  const c = { ...DEFAULT_CONFIG, ...config };
  const totalParticles = c.barCount * c.particlesPerBar;
  const positions = new Float32Array(totalParticles * 3);

  // 초기 프레임 (t=0) 스냅샷
  for (let bar = 0; bar < c.barCount; bar++) {
    // 나선 위 균일 배치 (0~1)
    const t = bar / c.barCount;
    const angle = t * c.helixTurns * Math.PI * 2;
    const centerX = c.ellipseA * Math.cos(angle);
    const centerZ = c.ellipseB * Math.sin(angle);
    const centerY = (0.5 - t) * c.helixHeight;

    for (let p = 0; p < c.particlesPerBar; p++) {
      const idx = (bar * c.particlesPerBar + p) * 3;

      // 막대 내부 랜덤 위치
      const localY = (Math.random() - 0.5) * c.barHeight;
      let localX: number, localZ: number;

      // 70% 표면, 30% 내부
      if (Math.random() < 0.7) {
        const face = Math.floor(Math.random() * 4);
        const hw = c.barWidth / 2, hd = c.barDepth / 2;
        switch (face) {
          case 0: localX = (Math.random() - 0.5) * c.barWidth; localZ = hd; break;
          case 1: localX = (Math.random() - 0.5) * c.barWidth; localZ = -hd; break;
          case 2: localX = hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
          default: localX = -hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
        }
      } else {
        localX = (Math.random() - 0.5) * c.barWidth;
        localZ = (Math.random() - 0.5) * c.barDepth;
      }

      positions[idx] = centerX + localX;
      positions[idx + 1] = centerY + localY;
      positions[idx + 2] = centerZ + localZ;
    }
  }

  return positions;
}

/**
 * shapeUpdater 등록: 매 프레임 막대들을 나선 경로를 따라 이동
 */
export function registerHelixBarUpdater(
  morpher: ParticleMorpher,
  shapeIdx: number,
  config?: Partial<HelixBarConfig>,
) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const shape = morpher.getShapeTargets()[shapeIdx];

  let elapsed = 0;

  // 각 막대 내 파티클의 로컬 오프셋을 사전 계산 (프레임마다 재생성하지 않도록)
  const barLocalOffsets = new Float32Array(c.particlesPerBar * 3);
  for (let p = 0; p < c.particlesPerBar; p++) {
    const localY = (Math.random() - 0.5) * c.barHeight;
    let localX: number, localZ: number;
    if (Math.random() < 0.7) {
      const face = Math.floor(Math.random() * 4);
      const hw = c.barWidth / 2, hd = c.barDepth / 2;
      switch (face) {
        case 0: localX = (Math.random() - 0.5) * c.barWidth; localZ = hd; break;
        case 1: localX = (Math.random() - 0.5) * c.barWidth; localZ = -hd; break;
        case 2: localX = hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
        default: localX = -hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
      }
    } else {
      localX = (Math.random() - 0.5) * c.barWidth;
      localZ = (Math.random() - 0.5) * c.barDepth;
    }
    barLocalOffsets[p * 3] = localX;
    barLocalOffsets[p * 3 + 1] = localY;
    barLocalOffsets[p * 3 + 2] = localZ;
  }

  morpher.setShapeUpdater(shapeIdx, (delta: number, _scrollProgress: number) => {
    elapsed += delta;

    const positions = shape.positions;
    const count = Math.min(shape.activeCount, c.barCount * c.particlesPerBar);

    // 시간에 따른 오프셋 (0~1 루프)
    const timeOffset = (elapsed * c.speed) % 1;

    for (let bar = 0; bar < c.barCount; bar++) {
      // 나선 위 위치: t가 1을 넘으면 0으로 순환 (무한 루프)
      const rawT = (bar / c.barCount + timeOffset) % 1;
      const angle = rawT * c.helixTurns * Math.PI * 2;

      // 타원 경로 위 중심 좌표
      const centerX = c.ellipseA * Math.cos(angle);
      const centerZ = c.ellipseB * Math.sin(angle);
      const centerY = (0.5 - rawT) * c.helixHeight;

      // 이 막대의 파티클들 업데이트
      const barStart = bar * c.particlesPerBar;
      const barEnd = Math.min(barStart + c.particlesPerBar, count);

      for (let i = barStart; i < barEnd; i++) {
        const localIdx = (i - barStart) * 3;
        const idx = i * 3;

        positions[idx] = centerX + barLocalOffsets[localIdx];
        positions[idx + 1] = centerY + barLocalOffsets[localIdx + 1];
        positions[idx + 2] = centerZ + barLocalOffsets[localIdx + 2];
      }
    }
  });
}
