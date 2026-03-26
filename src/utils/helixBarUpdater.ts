/**
 * 씬 09: 타원형 나선 경로를 따라 막대(bar)들이 무한히 내려오는 애니메이션.
 *
 * 파라미터 설계:
 * - barGap: 막대 사이 각도 간격 (도). 직관적으로 간격 조절
 * - pitch: 1회전(360도)당 Y 하강 거리. 위아래 나선 간격 조절
 * - speed: 각속도 (도/초). 이동 속도 조절
 * - 회전수는 barCount × barGap / 360 으로 자동 결정
 *
 * Window 방식: 모든 막대가 항상 화면 내에 존재, 아래로 빠지면 위에서 재등장
 */

import { ParticleMorpher } from '../scene/shapes/ParticleMorpher';

export interface HelixBarConfig {
  barCount: number;          // 막대 개수
  barHeight: number;         // 각 막대의 높이
  barWidth: number;          // 각 막대의 폭
  barDepth: number;          // 각 막대의 두께
  ellipseA: number;          // 타원 반장축 (X)
  ellipseB: number;          // 타원 반단축 (Z)
  barGap: number;            // 막대 사이 각도 간격 (도)
  pitch: number;             // 1회전(360도)당 Y 하강 거리
  speed: number;             // 각속도 (도/초)
  particlesPerBar: number;   // 막대당 파티클 수
  introBarInterval: number;  // 인트로 시 막대 추가 간격 (초, 0=인트로 없음)
}

const DEFAULT_CONFIG: HelixBarConfig = {
  barCount: 100,
  barHeight: 2.0,
  barWidth: 0.5,
  barDepth: 0.2, //0.08
  ellipseA: 4.0,
  ellipseB: 0.1,
  barGap: 12,              // 12도 간격 → 30개로 1회전
  pitch: 3.0,              // 1회전당 3유닛 하강
  speed: 10,                // 5도/초
  particlesPerBar: 300,    // 100 × 150 = 15,000
  introBarInterval: 0.15,  // 0.15초마다 막대 1개 추가 (0=인트로 없음)
};

/**
 * 초기 위치 생성 (precomputedPositions용)
 */
export function generateHelixBarPositions(config?: Partial<HelixBarConfig>): Float32Array {
  const c = { ...DEFAULT_CONFIG, ...config };
  const totalParticles = c.barCount * c.particlesPerBar;
  const positions = new Float32Array(totalParticles * 3);

  const gapRad = c.barGap * Math.PI / 180;
  const pitchPerRad = c.pitch / (Math.PI * 2);
  const totalAngleSpan = c.barCount * gapRad;
  const totalHeight = totalAngleSpan * pitchPerRad;
  const halfHeight = totalHeight / 2;

  for (let bar = 0; bar < c.barCount; bar++) {
    const angle = bar * gapRad;
    const centerX = c.ellipseA * Math.cos(angle);
    const centerZ = c.ellipseB * Math.sin(angle);
    const centerY = halfHeight - angle * pitchPerRad; // 원점 중심 정렬

    for (let p = 0; p < c.particlesPerBar; p++) {
      const idx = (bar * c.particlesPerBar + p) * 3;
      const hw = c.barWidth / 2, hd = c.barDepth / 2, hh = c.barHeight / 2;
      let localX: number, localY: number, localZ: number;

      const r = Math.random();
      if (r < 1.0) {
        // 50% → 모서리(edge): 12개 중 랜덤 선택, 한 축만 랜덤
        const edge = Math.floor(Math.random() * 12);
        if (edge < 4) {
          // Y축 방향 4개 모서리 (barHeight 방향)
          localY = (Math.random() - 0.5) * c.barHeight;
          localX = (edge & 1) ? hw : -hw;
          localZ = (edge & 2) ? hd : -hd;
        } else if (edge < 8) {
          // X축 방향 4개 모서리 (barWidth 방향)
          localX = (Math.random() - 0.5) * c.barWidth;
          localY = (edge & 1) ? hh : -hh;
          localZ = (edge & 2) ? hd : -hd;
        } else {
          // Z축 방향 4개 모서리 (barDepth 방향)
          localZ = (Math.random() - 0.5) * c.barDepth;
          localX = (edge & 1) ? hw : -hw;
          localY = (edge & 2) ? hh : -hh;
        }
      } else if (r < 0.9) {
        // 40% → 표면(face)
        localY = (Math.random() - 0.5) * c.barHeight;
        const face = Math.floor(Math.random() * 4);
        switch (face) {
          case 0: localX = (Math.random() - 0.5) * c.barWidth; localZ = hd; break;
          case 1: localX = (Math.random() - 0.5) * c.barWidth; localZ = -hd; break;
          case 2: localX = hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
          default: localX = -hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
        }
      } else {
        // 10% → 내부
        localX = (Math.random() - 0.5) * c.barWidth;
        localY = (Math.random() - 0.5) * c.barHeight;
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
 * shapeUpdater 등록
 *
 * 각 막대는 고유한 기본 각도(bar * barGap)를 가짐.
 * 시간이 흐르면 모든 막대의 각도가 동일하게 증가 (speed 도/초).
 * Y 위치 = -angle * pitchPerRad 로 각도에 비례해 하강.
 * 전체 나선 높이(totalHeight) 범위를 벗어나면 모듈러로 순환.
 */
export function registerHelixBarUpdater(
  morpher: ParticleMorpher,
  shapeIdx: number,
  config?: Partial<HelixBarConfig>,
) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const shape = morpher.getShapeTargets()[shapeIdx];

  let elapsed = 0;

  const gapRad = c.barGap * Math.PI / 180;
  const pitchPerRad = c.pitch / (Math.PI * 2);

  // 전체 나선이 차지하는 높이 (barCount개 막대의 총 높이)
  const totalAngleSpan = c.barCount * gapRad;
  const totalHeight = totalAngleSpan * pitchPerRad;
  const halfHeight = totalHeight / 2;

  // 막대별 로컬 오프셋 사전 계산
  const allBarOffsets = new Float32Array(c.barCount * c.particlesPerBar * 3);
  for (let bar = 0; bar < c.barCount; bar++) {
    for (let p = 0; p < c.particlesPerBar; p++) {
      const idx = (bar * c.particlesPerBar + p) * 3;
      const hw = c.barWidth / 2, hd = c.barDepth / 2, hh = c.barHeight / 2;
      let localX: number, localY: number, localZ: number;

      const r = Math.random();
      if (r < 1.0) {
        // 50% → 모서리(edge)
        const edge = Math.floor(Math.random() * 12);
        if (edge < 4) {
          localY = (Math.random() - 0.5) * c.barHeight;
          localX = (edge & 1) ? hw : -hw;
          localZ = (edge & 2) ? hd : -hd;
        } else if (edge < 8) {
          localX = (Math.random() - 0.5) * c.barWidth;
          localY = (edge & 1) ? hh : -hh;
          localZ = (edge & 2) ? hd : -hd;
        } else {
          localZ = (Math.random() - 0.5) * c.barDepth;
          localX = (edge & 1) ? hw : -hw;
          localY = (edge & 2) ? hh : -hh;
        }
      } else if (r < 0.9) {
        // 40% → 표면(face)
        localY = (Math.random() - 0.5) * c.barHeight;
        const face = Math.floor(Math.random() * 4);
        switch (face) {
          case 0: localX = (Math.random() - 0.5) * c.barWidth; localZ = hd; break;
          case 1: localX = (Math.random() - 0.5) * c.barWidth; localZ = -hd; break;
          case 2: localX = hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
          default: localX = -hw; localZ = (Math.random() - 0.5) * c.barDepth; break;
        }
      } else {
        localX = (Math.random() - 0.5) * c.barWidth;
        localY = (Math.random() - 0.5) * c.barHeight;
        localZ = (Math.random() - 0.5) * c.barDepth;
      }
      allBarOffsets[idx] = localX;
      allBarOffsets[idx + 1] = localY;
      allBarOffsets[idx + 2] = localZ;
    }
  }

  morpher.setShapeUpdater(shapeIdx, (delta: number, _scrollProgress: number) => {
    elapsed += delta;

    const positions = shape.positions;
    const count = Math.min(shape.activeCount, c.barCount * c.particlesPerBar);

    // 시간에 따른 각도 오프셋 (라디안)
    const timeAngle = elapsed * c.speed * Math.PI / 180;

    for (let bar = 0; bar < c.barCount; bar++) {
      const barStart = bar * c.particlesPerBar;
      const barEnd = Math.min(barStart + c.particlesPerBar, count);

      // 각 막대의 현재 각도 = 기본 각도 + 시간 오프셋
      const baseAngle = bar * gapRad;
      const currentAngle = baseAngle + timeAngle;

      // Y 위치: 각도에 비례해 하강, totalHeight 범위 내에서 순환
      const rawY = (currentAngle * pitchPerRad) % totalHeight;
      const centerY = halfHeight - rawY;

      // 타원 경로 위 X, Z
      const centerX = c.ellipseA * Math.cos(currentAngle);
      const centerZ = c.ellipseB * Math.sin(currentAngle);

      for (let i = barStart; i < barEnd; i++) {
        const offIdx = i * 3;
        const idx = i * 3;

        positions[idx] = centerX + allBarOffsets[offIdx];
        positions[idx + 1] = centerY + allBarOffsets[offIdx + 1];
        positions[idx + 2] = centerZ + allBarOffsets[offIdx + 2];
      }
    }
  });
}
